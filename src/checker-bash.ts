/**
 * Bash checker - validates bash commands against config
 *
 * 1. Parses the command with unbash
 * 2. Runs pre-checks (env conditions)
 * 3. Finds matching rule for the command
 * 4. Parses arguments (flags, options, positionals)
 * 5. Checks each path against appropriate permissions (read/write)
 * 6. Returns the strictest action
 */

import { walkBash, type FoundCommand } from "./bash-walker.js";
import { parseArgs } from "./arg-parser.js";
import {
  checkRead,
  checkWrite,
  getDefaultContext,
} from "./path-permission.js";
import { evaluatePreChecks } from "./pre-check.js";
import { clearlyNotAPath } from "./path-utils.js";
import type { SanityConfig, Rule, Action } from "./config-types.js";
import type { CheckResult } from "./types.js";
import { aggregateResults } from "./action-utils.js";

/**
 * Check if a normalized command matches a rule name prefix.
 * Word boundary: "git" matches "git push" but not "github".
 */
function matchesPrefix(normalized: string, prefix: string): boolean {
  if (prefix === "") return true;
  if (!normalized.startsWith(prefix)) return false;
  const nextChar = normalized[prefix.length];
  return nextChar === undefined || nextChar === " ";
}

/**
 * Find the highest-priority matching rule for a command.
 * Rules are pre-sorted by priority descending, so first match wins.
 */
function findMatchingRule(normalized: string, rules: Rule[]): Rule | undefined {
  for (const rule of rules) {
    if (matchesPrefix(normalized, rule.name)) {
      return rule;
    }
  }
  return undefined;
}

/**
 * Check if a bash command is allowed
 */
export function checkBash(command: string, config: SanityConfig): CheckResult {
  if (!command.trim()) {
    return { action: "allow" };
  }

  const walkResult = walkBash(command);

  if (walkResult.errors && walkResult.errors.length > 0) {
    const errorMessages = walkResult.errors.map(e => e.message).join("; ");
    return {
      action: "deny",
      reason: `Invalid bash syntax: ${errorMessages}`
    };
  }

  const results: CheckResult[] = [];
  for (const cmd of walkResult.commands) {
    results.push(checkSingleCommand(cmd, config));
  }

  if (results.length === 0) {
    return { action: "allow" };
  }

  return aggregateResults(results);
}

/**
 * Check a single parsed command
 */
function checkSingleCommand(
  cmd: FoundCommand,
  config: SanityConfig,
): CheckResult {
  const commandName = cmd.name ?? "";
  const normalized = commandName + (cmd.args.length > 0 ? " " + cmd.args.join(" ") : "");
  const rule = findMatchingRule(normalized, config.commands.rules);

  const results: CheckResult[] = [];

  // If no rule matches, still check redirects (they have their own path permissions)
  if (!rule) {
    const redirectResults = checkRedirects(cmd, config);
    results.push(...redirectResults);
    if (results.length === 0) {
      return { action: config.commands.default_action };
    }
    return aggregateResults(results);
  }

  // 1. Evaluate pre-checks
  if (rule.config.pre_checks && rule.config.pre_checks.length > 0) {
    const preCheckResult = evaluatePreChecks(rule.config.pre_checks);
    if (preCheckResult) {
      results.push({
        action: preCheckResult.action,
        reason: preCheckResult.reasons.join("; "),
      });
    }
  }

  // 2. Parse args (pure)
  const parsed = parseArgs(cmd.args, rule.config, cmd.dynamicIndices);

  // 3. Flag actions
  for (const flagConfig of rule.config.flags ?? []) {
    if (parsed.flags.has(flagConfig.flag)) {
      results.push({
        action: flagConfig.action,
        reason: flagConfig.reason,
      });
    }
  }

  // 4. Options — check consumed values against path permissions
  for (const [optName, { value, originalIndex }] of parsed.options) {
    if (cmd.dynamicIndices.has(originalIndex)) continue;
    const perms = rule.config.options![optName];
    for (const perm of perms) {
      const res = checkPathWithPermission(value, perm, config);
      if (res.action !== "allow") results.push(res);
    }
  }

  // 5. Positionals — check against index-based overrides
  if (rule.config.positionals) {
    const { default_perm = [], overrides } = rule.config.positionals;
    for (let i = 0; i < parsed.positionals.length; i++) {
      const { value, originalIndex } = parsed.positionals[i];
      const indexStr = String(i);
      const negIndexStr = String(i - parsed.positionals.length);

      let perm = default_perm;
      if (overrides) {
        if (overrides[negIndexStr]) perm = overrides[negIndexStr];
        else if (overrides[indexStr]) perm = overrides[indexStr];
      }

      if (!perm || perm.length === 0) continue;
      if (cmd.dynamicIndices.has(originalIndex)) continue;

      for (const p of perm) {
        const res = checkPathWithPermission(value, p, config);
        if (res.action !== "allow") results.push(res);
      }
    }
  }

  // 6. Redirects
  const redirectResults = checkRedirects(cmd, config);
  results.push(...redirectResults);

  // 7. If no specific checks applied, use rule's fallback action
  if (results.length === 0) {
    return {
      action: rule.action,
      reason: rule.reason,
    };
  }

  return aggregateResults(results);
}

/**
 * Check a path with a specific permission type.
 */
function checkPathWithPermission(
  path: string,
  perm: string,
  config: SanityConfig,
): { action: Action; reason?: string } {
  const ctx = getDefaultContext();

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
      const result = checkRead(redirect.target, config, ctx);
      if (result.action !== "allow") {
        results.push({ action: result.action, reason: result.reason });
      }
    } else if (redirect.isOutput) {
      const result = checkWrite(redirect.target, config, ctx);
      if (result.action !== "allow") {
        results.push({ action: result.action, reason: result.reason });
      }
    }
  }

  return results;
}
