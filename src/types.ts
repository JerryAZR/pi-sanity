/**
 * Action types for sanity checks
 */
export type Action = "allow" | "ask" | "deny";

/**
 * Universal check result - action and optional reason
 */
export interface CheckResult {
  action: Action;
  reason?: string;
}
