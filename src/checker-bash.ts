/**
 * Bash checker - validates bash commands against config
 *
 * This is the most complex checker. It:
 * 1. Parses the command with unbash
 * 2. Runs pre-checks (env conditions)
 * 3. Extracts paths from arguments and redirects
 * 4. Checks each path against appropriate permissions (read/write)
 * 5. Checks command-specific flags/options
 * 6. Returns the strictest action
 */

import { walkBash, type FoundCommand } from "./bash-walker.js";
import {
  checkRead,
  checkWrite,
  getDefaultContext,
} from "./path-permission.js";
import { evaluatePreChecks } from "./pre-check.js";
import { getCommandConfig } from "./config-loader.js";
import { clearlyNotAPath } from "./path-utils.js";
import type { SanityConfig, CommandConfig, Action } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if a flag is present in command arguments.
 *
 * Algorithm:
 * 1. Exact match always works (handles --long, -Wall, -O2, standalone -f).
 * 2. For single-char short flags (-x), if exact match fails, check if the
 *    character appears in combined short flag tokens.
 * 3. Multi-char single-dash tokens that are explicitly declared in the config
 *    (e.g., -Wall) are treated as atomic — they are not decomposed.
 */
function hasFlag(
  args: string[],
  flag: string,
  declaredFlags: Set<string>,
): boolean {
  // Exact match
  if (args.includes(flag)) return true;

  // Single-char short flag: try combined match
  if (flag.startsWith("-") && flag.length === 2 && !flag.startsWith("--")) {
    const flagChar = flag[1];
    for (const arg of args) {
      if (!arg.startsWith("-") || arg.startsWith("--") || arg.length < 2)
        continue;

      // If this arg is a declared multi-char flag, it's atomic — don't decompose
      if (arg.length > 2 && declaredFlags.has(arg)) continue;

      // Check if the flag character appears in the combined token
      if (arg.slice(1).includes(flagChar)) return true;
    }
  }

  return false;
}

/**
 * Action priority for comparison (higher = stricter)
 */
const ACTION_PRIORITY: Record<Action, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
};

/**
 * Get the stricter of two actions
 */
function stricterAction(a: Action, b: Action): Action {
  return ACTION_PRIORITY[a] >= ACTION_PRIORITY[b] ? a : b;
}

/**
 * Check if a bash command is allowed
 *
 * @param command - Bash command string to check
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkBash(command: string, config: SanityConfig): CheckResult {
  // Handle empty command
  if (!command.trim()) {
    return { action: "allow" };
  }

  // Parse command
  const walkResult = walkBash(command);

  // Deny if there were parse errors - invalid bash syntax
  if (walkResult.errors && walkResult.errors.length > 0) {
    const errorMessages = walkResult.errors.map(e => e.message).join("; ");
    return {
      action: "deny",
      reason: `Invalid bash syntax: ${errorMessages}`
    };
  }

  // Check each command found (handles pipelines, subshells)
  const results: CheckResult[] = [];
  for (const cmd of walkResult.commands) {
    results.push(checkSingleCommand(cmd, config));
  }

  // Return strictest action across all commands
  if (results.length === 0) {
    return { action: "allow" };
  }

  let strictest = results[0].action;
  const reasons: string[] = [];

  for (const result of results) {
    strictest = stricterAction(strictest, result.action);
    if (result.reason) {
      reasons.push(result.reason);
    }
  }

  return {
    action: strictest,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

/**
 * Check a single parsed command
 */
function checkSingleCommand(
  cmd: FoundCommand,
  config: SanityConfig,
): CheckResult {
  const commandName = cmd.name ?? "";
  const cmdConfig = getCommandConfig(config, commandName);

  // Results collection
  const results: { action: Action; reason?: string }[] = [];

  // 1. Evaluate pre-checks
  if (cmdConfig?.pre_checks && cmdConfig.pre_checks.length > 0) {
    const preCheckResult = evaluatePreChecks(cmdConfig.pre_checks);
    if (preCheckResult) {
      results.push({
        action: preCheckResult.action,
        reason: preCheckResult.reasons.join("; "),
      });
    }
  }

  // 2. Check flags
  if (cmdConfig?.flags) {
    const declaredFlags = new Set(cmdConfig.flags.map((f) => f.flag));
    for (const flagConfig of cmdConfig.flags) {
      if (hasFlag(cmd.args, flagConfig.flag, declaredFlags)) {
        results.push({
          action: flagConfig.action,
          reason: flagConfig.reason,
        });
      }
    }
  }

  // 3. Check positional arguments
  const positionalResults = checkPositionals(cmd, config, cmdConfig);
  results.push(...positionalResults);

  // 4. Check redirects
  const redirectResults = checkRedirects(cmd, config);
  results.push(...redirectResults);

  // 5. If no specific checks applied, use command default
  if (results.length === 0) {
    if (cmdConfig) {
      return {
        action: cmdConfig.default_action ?? "allow",
        reason: cmdConfig.reason,
      };
    }
    return { action: "allow" };
  }

  // Return strictest result
  let strictest = results[0].action;
  const reasons: string[] = [];

  for (const result of results) {
    strictest = stricterAction(strictest, result.action);
    if (result.reason) {
      reasons.push(result.reason);
    }
  }

  return {
    action: strictest,
    reason: reasons.length > 0 ? reasons.join("; ") : undefined,
  };
}

/**
 * Check positional arguments and option values.
 *
 * Single-pass state machine:
 * 1. Scan args left-to-right.
 * 2. If pendingOption is set, consume current arg as option value.
 * 3. If arg is `-o=value`, split and consume value inline.
 * 4. If arg is a declared flag, skip it.
 * 5. If arg is a declared option, set pendingOption.
 * 6. If arg is a combined short string containing an option, set pendingOption.
 * 7. Otherwise, push to positionals array.
 */
function checkPositionals(
  cmd: FoundCommand,
  config: SanityConfig,
  cmdConfig: CommandConfig | undefined,
): { action: Action; reason?: string }[] {
  const results: { action: Action; reason?: string }[] = [];
  const args = cmd.args;

  const declaredFlags = new Set(cmdConfig?.flags?.map((f) => f.flag) ?? []);
  const declaredOptions = new Set(Object.keys(cmdConfig?.options ?? {}));

  interface PositionalEntry {
    arg: string;
    originalIndex: number;
  }
  const positionalEntries: PositionalEntry[] = [];
  let pendingOption: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // 1. Consume pending option value
    if (pendingOption) {
      const perm = cmdConfig!.options![pendingOption];
      if (!cmd.dynamicIndices.has(i)) {
        for (const p of perm) {
          const res = checkPathWithPermission(arg, p, config);
          if (res.action !== "allow") results.push(res);
        }
      }
      pendingOption = null;
      continue;
    }

    // 2. -o=value form
    if (arg.includes("=") && arg.startsWith("-") && !arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      const key = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      if (declaredOptions.has(key)) {
        const perm = cmdConfig!.options![key];
        if (!cmd.dynamicIndices.has(i)) {
          for (const p of perm) {
            const res = checkPathWithPermission(value, p, config);
            if (res.action !== "allow") results.push(res);
          }
        }
        continue;
      }
    }

    // 3. Exact flag match — skip (already checked in checkSingleCommand)
    if (declaredFlags.has(arg)) continue;

    // 4. Exact option match
    if (declaredOptions.has(arg)) {
      pendingOption = arg;
      continue;
    }

    // 5. Combined short string
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.length > 2) {
      // If it's a declared multi-char flag, skip it atomically
      if (declaredFlags.has(arg)) continue;

      // Check for option characters inside
      const chars = arg.slice(1).split("");
      for (const char of chars) {
        const short = `-${char}`;
        if (declaredOptions.has(short)) {
          pendingOption = short; // next arg is the value
          break;
        }
      }
      continue;
    }

    // 6. Unknown option
    if (arg.startsWith("-")) continue;

    // 7. Positional
    positionalEntries.push({ arg, originalIndex: i });
  }

  // Check positionals with index-based overrides
  if (cmdConfig?.positionals) {
    const { default_perm, overrides } = cmdConfig.positionals;
    for (let i = 0; i < positionalEntries.length; i++) {
      const { arg, originalIndex } = positionalEntries[i];
      const indexStr = String(i);
      const negIndexStr = String(i - positionalEntries.length);

      let perm = default_perm;
      if (overrides) {
        if (overrides[negIndexStr]) perm = overrides[negIndexStr];
        else if (overrides[indexStr]) perm = overrides[indexStr];
      }

      if (perm.length === 0) continue;
      if (cmd.dynamicIndices.has(originalIndex)) continue;

      for (const p of perm) {
        const res = checkPathWithPermission(arg, p, config);
        if (res.action !== "allow") results.push(res);
      }
    }
  }

  return results;
}

/**
 * Check a path with a specific permission type.
 * Filters out strings that clearly cannot be valid paths.
 */
function checkPathWithPermission(
  path: string,
  perm: string,
  config: SanityConfig,
): { action: Action; reason?: string } {
  const ctx = getDefaultContext();

  // Skip strings that contain forbidden characters (can't be valid paths)
  if (clearlyNotAPath(path)) {
    return { action: "allow" };
  }

  switch (perm) {
    case "read": {
      const result = checkRead(path, config, ctx);
      return { action: result.action, reason: result.reason };
    }
    case "write": {
      const result = checkWrite(path, config, ctx);
      return { action: result.action, reason: result.reason };
    }
    case "delete": {
      // Deletion is a write operation (modifies parent directory)
      const result = checkWrite(path, config, ctx);
      return { action: result.action, reason: result.reason };
    }
    default:
      return { action: "allow" };
  }
}

/**
 * Check redirects
 */
function checkRedirects(
  cmd: FoundCommand,
  config: SanityConfig,
): { action: Action; reason?: string }[] {
  const results: { action: Action; reason?: string }[] = [];
  const ctx = getDefaultContext();

  for (const redirect of cmd.redirects) {
    if (redirect.isInput) {
      // Input redirect: check read permission
      const result = checkRead(redirect.target, config, ctx);
      if (result.action !== "allow") {
        results.push({ action: result.action, reason: result.reason });
      }
    } else if (redirect.isOutput) {
      // Output redirect: check write permission
      const result = checkWrite(redirect.target, config, ctx);
      if (result.action !== "allow") {
        results.push({ action: result.action, reason: result.reason });
      }
    }
  }

  return results;
}
