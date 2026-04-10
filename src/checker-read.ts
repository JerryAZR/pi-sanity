/**
 * Read checker - validates read operations against config
 */

import { checkRead as checkReadPath, getDefaultContext } from "./path-permission.js";
import type { SanityConfig } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if reading a path is allowed
 *
 * Note: This is for direct read operations (pi read tool), NOT bash commands.
 * Pre-checks only apply to commands, not direct file operations.
 *
 * @param filePath - Path to read
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkRead(filePath: string, config: SanityConfig): CheckResult {
  // Direct read operations only check path permissions
  // (pre-checks are for commands, not file operations)
  const pathResult = checkReadPath(filePath, config, getDefaultContext());

  return {
    action: pathResult.action,
    reason: pathResult.reason,
  };
}
