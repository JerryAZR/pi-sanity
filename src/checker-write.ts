/**
 * Write checker - validates write operations against config
 */

import { checkWrite as checkWritePath, getDefaultContext } from "./path-permission.js";
import type { SanityConfig } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if writing to a path is allowed
 *
 * Note: This is for direct write operations (pi write/edit tool), NOT bash commands.
 * Pre-checks only apply to commands, not direct file operations.
 *
 * @param filePath - Path to write
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkWrite(filePath: string, config: SanityConfig): CheckResult {
  // Direct write operations only check path permissions
  // (pre-checks are for commands, not file operations)
  const pathResult = checkWritePath(filePath, config, getDefaultContext());

  return {
    action: pathResult.action,
    reason: pathResult.reason,
  };
}
