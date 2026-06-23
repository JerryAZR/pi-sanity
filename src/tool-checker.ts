/**
 * Generic tool-call checker.
 *
 * Looks up a tool name in the configured tool rules, runs the requested
 * checks (read/write/bash) against the named parameters, and returns the
 * aggregated result.
 */

import { checkRead } from "./checker-read.js";
import { checkWrite } from "./checker-write.js";
import { checkBash } from "./checker-bash.js";
import { aggregateResults } from "./action-utils.js";
import type { SanityConfig, ToolParamCheck } from "./config-types.js";
import type { CheckResult } from "./types.js";

const CHECKERS = {
  read: checkRead,
  write: checkWrite,
  bash: checkBash,
} as const;

function normalizeParamValue(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) return [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  return [];
}

export function checkToolCall(
  toolName: string,
  input: Record<string, unknown>,
  config: SanityConfig,
): CheckResult | undefined {
  const checks = config.tools.rules.get(toolName);
  if (!checks) {
    return undefined;
  }

  const results: CheckResult[] = [];

  for (const check of checks) {
    const values = normalizeParamValue(input[check.param]);
    if (values.length === 0) {
      // Missing/empty param: pass through for this check. The framework
      // should validate required arguments before invoking the tool.
      continue;
    }

    for (const value of values) {
      const checkResult = CHECKERS[check.check](value, config);
      if (checkResult.action !== "allow") {
        results.push(checkResult);
      }
    }
  }

  if (results.length === 0) {
    return { action: "allow" };
  }

  return aggregateResults(results);
}

/**
 * Build a human-readable description of the parameters being checked.
 * Used in the confirmation dialog title.
 */
export function buildToolDetails(
  toolName: string,
  input: Record<string, unknown>,
  config: SanityConfig,
): string {
  const checks = config.tools.rules.get(toolName);
  if (!checks) return `Tool: ${toolName}`;

  // Group checks by parameter so a single param checked as both read and
  // write is shown once with all its check types.
  const grouped = new Map<string, string[]>();
  for (const check of checks) {
    const list = grouped.get(check.param) ?? [];
    if (!list.includes(check.check)) {
      list.push(check.check);
    }
    grouped.set(check.param, list);
  }

  const lines: string[] = [`Tool: ${toolName}`];
  for (const [param, checkTypes] of grouped) {
    const value = input[param];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (value.every((v) => typeof v !== "string")) continue;
    } else if (typeof value !== "string") {
      continue;
    }

    const display = Array.isArray(value) ? value.join(", ") : String(value);
    lines.push(`  ${param} (${checkTypes.join(", ")}): ${display}`);
  }

  return lines.join("\n");
}
