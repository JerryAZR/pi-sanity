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
  checkDelete,
  getDefaultContext,
} from "./path-permission.js";
import { evaluatePreChecks } from "./pre-check.js";
import { getCommandConfig } from "./config-loader.js";
import type { SanityConfig, CommandConfig, Action } from "./config-types.js";
import type { CheckResult } from "./types.js";

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
    for (const [flag, flagConfig] of Object.entries(cmdConfig.flags)) {
      if (cmd.args.includes(flag)) {
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
        action: cmdConfig.default_action,
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
 * Check positional arguments
 */
function checkPositionals(
  cmd: FoundCommand,
  config: SanityConfig,
  cmdConfig: CommandConfig | undefined,
): { action: Action; reason?: string }[] {
  const results: { action: Action; reason?: string }[] = [];

  if (!cmdConfig?.positionals) {
    return results;
  }

  const { default_perm, overrides } = cmdConfig.positionals;
  const args = cmd.args;

  // Filter out options (args starting with -)
  const positionalArgs: string[] = [];
  let skipNext = false;
  for (let i = 0; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const arg = args[i];
    // Check if this is an option with a value
    if (cmdConfig.options && arg in cmdConfig.options) {
      // Skip the option and its value
      skipNext = true;
      continue;
    }
    // Skip standalone flags
    if (cmdConfig.flags && arg in cmdConfig.flags) {
      continue;
    }
    // Skip other options (starting with -)
    if (arg.startsWith("-")) {
      continue;
    }
    positionalArgs.push(arg);
  }

  // Check each positional
  for (let i = 0; i < positionalArgs.length; i++) {
    const arg = positionalArgs[i];
    const indexStr = String(i);
    const negIndexStr = String(i - positionalArgs.length); // -1, -2, etc.

    // Determine permission for this position
    let perm = default_perm;
    if (overrides) {
      // Check both positive and negative indices
      if (overrides[negIndexStr]) {
        perm = overrides[negIndexStr];
      } else if (overrides[indexStr]) {
        perm = overrides[indexStr];
      }
    }

    // Empty perm means no check
    if (!perm) {
      continue;
    }

    // Check the path with specified permission(s)
    const perms = perm.split(",").map((p) => p.trim());
    for (const p of perms) {
      const checkResult = checkPathWithPermission(arg, p, config);
      if (checkResult.action !== "allow") {
        results.push(checkResult);
      }
    }
  }

  // Check option values
  if (cmdConfig.options) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg in cmdConfig.options) {
        const perm = cmdConfig.options[arg];
        const value = args[i + 1];
        if (value && !value.startsWith("-")) {
          const checkResult = checkPathWithPermission(value, perm, config);
          if (checkResult.action !== "allow") {
            results.push(checkResult);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Check a path with a specific permission type
 */
function checkPathWithPermission(
  path: string,
  perm: string,
  config: SanityConfig,
): { action: Action; reason?: string } {
  const ctx = getDefaultContext();

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
      const result = checkDelete(path, config, ctx);
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
