/**
 * Read checker - validates read operations against config
 */

import type { SanityConfig } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if reading a path is allowed
 * 
 * @param filePath - Path to read
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkRead(filePath: string, config: SanityConfig): CheckResult {
  // TODO: Implement
  // 1. Pre-checks (env conditions)
  // 2. Path permission check against config.permissions.read
  throw new Error("Not implemented");
}
