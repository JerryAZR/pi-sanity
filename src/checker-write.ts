/**
 * Write checker - validates write operations against config
 */

import { checkWrite as checkWritePath, getDefaultContext } from "./path-permission.js";
import { evaluatePreChecks } from "./pre-check.js";
import { getCommandConfig } from "./config-loader.js";
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
  // 1. Evaluate pre-checks if "write" command has any
  const commandConfig = getCommandConfig(config, "write");
  if (commandConfig?.pre_checks && commandConfig.pre_checks.length > 0) {
    const preCheckResult = evaluatePreChecks(commandConfig.pre_checks);
    if (preCheckResult?.action === "deny") {
      return {
        action: "deny",
        reason: preCheckResult.reasons.join("; "),
      };
    }
  }

  // 2. Check path permission
  const pathResult = checkWritePath(filePath, config, getDefaultContext());

  // 3. Return result
  return {
    action: pathResult.action,
    reason: pathResult.reason,
  };
}
