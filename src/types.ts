/**
 * Core types for pi-sanity checkers
 */

export type Action = "allow" | "ask" | "deny";

/**
 * Result from any checker operation
 */
export interface CheckResult {
  action: Action;
  reason?: string;
}
