/**
 * Shared action-priority utilities for pi-sanity checkers.
 */

import type { Action } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Action priority for comparison (higher = stricter)
 */
export const ACTION_PRIORITY: Record<Action, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
};

/**
 * Get the stricter of two actions.
 */
export function stricterAction(a: Action, b: Action): Action {
  return ACTION_PRIORITY[a] >= ACTION_PRIORITY[b] ? a : b;
}

/**
 * Aggregate multiple check results into the strictest action.
 * Reasons are joined with "; " when present.
 */
export function aggregateResults(results: CheckResult[]): CheckResult {
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
