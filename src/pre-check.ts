/**
 * Environment pre-check evaluator.
 * 
 * This implements environment variable pre-checks, the currently supported
 * pre-check type. The user-facing config uses "pre_checks" which may support
 * other types (time, host, etc.) in the future.
 * 
 * Syntax:
 * - "pattern" | ":pattern"         → exact match (colon optional, stripped)
 * - "!pattern"                   → exact "!pattern" (literal - no colon!)
 * - "!:pattern"                  → NOT pattern (negated exact - has colon!)
 * - "::pattern"                  → exact ":pattern" (second colon becomes part of pattern)
 * - "glob:pattern"               → glob match
 * - "!glob:pattern"              → NOT glob match
 * - "re:pattern"                 → regex match
 * - "!re:pattern"                → NOT regex match
 * 
 * RULE: Colon is REQUIRED for prefix parsing. No colon = positive exact.
 * 
 * MISSPELLED TYPES: "typo:pattern" → exact match of literal "typo:pattern"
 * The regex only recognizes "glob" and "re" as valid types. Anything else
 * before the colon (including typos) results in a fallback to exact match.
 * This is safe but potentially confusing - users should verify their patterns.
 */

import * as path from "node:path";
import type { Action } from "./config-types.js";

export interface PreCheckResult {
  action: Action;
  reason?: string;
  matched: boolean;
}

interface ParsedPattern {
  type: "exact" | "glob" | "regex";
  negated: boolean;
  pattern: string;
}

/**
 * Tokenize pattern using regex.
 * 
 * Structure: [!]? (?:glob|re)? : pattern
 * - Optional negate: !?
 * - Optional type: (?:glob|re)?
 * - Mandatory colon separator
 * - Pattern content
 */
const PREFIX_REGEX = /^(?<negate>!)?(?<type>glob|re)?:(?<pattern>.*)$/;

/**
 * Parse a match pattern.
 * 
 * RULE: If there's no colon (or just escapes), it's positive exact.
 * 
 * Priority:
 * 1. "::" at start = escaped literal colon → exact ":pattern"
 * 2. Match PREFIX_REGEX (must have colon) → typed or negated exact
 * 3. No colon match → positive exact (literal, including leading "!")
 */
export function parseMatchPattern(rawPattern: string): ParsedPattern {
  // Empty pattern
  if (rawPattern === "") {
    return { type: "exact", negated: false, pattern: "" };
  }

  // Try to match prefix pattern: MUST have colon
  const match = rawPattern.match(PREFIX_REGEX);
  
  if (match?.groups) {
    const negate = match.groups.negate === "!";
    const type = match.groups.type; // "glob", "re", or undefined
    const patternContent = match.groups.pattern;

    if (type === "glob") {
      return { type: "glob", negated: negate, pattern: patternContent };
    }
    if (type === "re") {
      return { type: "regex", negated: negate, pattern: patternContent };
    }
    // Has colon but no type: exact match (negated if ! present)
    // "!:" → negated exact with empty pattern
    // ":foo" → positive exact "foo"
    return { type: "exact", negated: negate, pattern: patternContent };
  }

  // NO COLON FOUND - positive exact match, literal string
  // This includes "!prod" (literal), "glob" (literal), "re" (literal)
  return { type: "exact", negated: false, pattern: rawPattern };
}

/**
 * Check if env value matches the pattern
 */
export function matchesPattern(value: string, pattern: string): boolean {
  const parsed = parseMatchPattern(pattern);
  let matches: boolean;

  switch (parsed.type) {
    case "exact":
      matches = value === parsed.pattern;
      break;
    case "glob": {
      const normalizedValue = value.replace(/\\/g, "/");
      const normalizedPattern = parsed.pattern.replace(/\\/g, "/");
      // @ts-ignore - matchesGlob is available in Node 22+
      matches = path.matchesGlob(normalizedValue, normalizedPattern);
      break;
    }
    case "regex": {
      const regex = new RegExp(parsed.pattern);
      matches = regex.test(value);
      break;
    }
    default:
      matches = false;
  }

  if (parsed.negated) {
    matches = !matches;
  }

  return matches;
}

/**
 * Evaluate a single pre-check condition
 */
export function evaluatePreCheck(
  envName: string,
  matchPattern: string,
  envValue: string | undefined,
  action: Action,
  reason?: string,
): PreCheckResult {
  const value = envValue ?? "";
  const matched = matchesPattern(value, matchPattern);

  return {
    matched,
    action,
    reason,
  };
}

/**
 * Action priority for comparison
 */
const ACTION_PRIORITY: Record<Action, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
};

function stricterAction(a: Action, b: Action): Action {
  return ACTION_PRIORITY[a] >= ACTION_PRIORITY[b] ? a : b;
}

/**
 * Evaluate multiple pre-checks and return strictest action
 */
export function evaluatePreChecks(
  checks: Array<{
    env: string;
    match: string;
    action: Action;
    reason?: string;
  }>,
): { action: Action; reasons: string[] } | undefined {
  if (checks.length === 0) {
    return undefined;
  }

  const matchingResults: PreCheckResult[] = [];

  for (const check of checks) {
    const envValue = process.env[check.env];
    const result = evaluatePreCheck(
      check.env,
      check.match,
      envValue,
      check.action,
      check.reason,
    );

    if (result.matched) {
      matchingResults.push(result);
    }
  }

  if (matchingResults.length === 0) {
    return undefined;
  }

  let strictestAction: Action = matchingResults[0].action;
  const reasons: string[] = [];

  for (const result of matchingResults) {
    strictestAction = stricterAction(strictestAction, result.action);
    if (result.reason) {
      reasons.push(result.reason);
    }
  }

  return {
    action: strictestAction,
    reasons,
  };
}
