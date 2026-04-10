/**
 * Write checker - validates write operations against config
 */

import type { SanityConfig } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if writing to a path is allowed
 * 
 * @param filePath - Path to write
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkWrite(filePath: string, config: SanityConfig): CheckResult {
  // TODO: Implement
  // 1. Pre-checks (env conditions)
  // 2. Path permission check against config.permissions.write
  throw new Error("Not implemented");
}
