/**
 * Read checker - validates read operations against config
 */

import { checkRead as checkReadPath, getDefaultContext } from "./path-permission.js";
import { evaluatePreChecks } from "./pre-check.js";
import { getCommandConfig } from "./config-loader.js";
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
  // 1. Evaluate pre-checks if "read" command has any
  const commandConfig = getCommandConfig(config, "read");
  if (commandConfig?.pre_checks && commandConfig.pre_checks.length > 0) {
    const preCheckResult = evaluatePreChecks(commandConfig.pre_checks);
    if (preCheckResult?.action === "deny") {
      return {
        action: "deny",
        reason: preCheckResult.reasons.join("; "),
      };
    }
    // Note: "ask" from pre-checks would need to be combined with path check result
    // For now, we continue and let path check determine final result
  }

  // 2. Check path permission
  const pathResult = checkReadPath(filePath, config, getDefaultContext());

  // 3. Return result
  return {
    action: pathResult.action,
    reason: pathResult.reason,
  };
}
