/**
 * Bash checker - validates bash commands against config
 * 
 * This is the most complex checker. It:
 * 1. Parses the command with unbash
 * 2. Runs pre-checks (env conditions)
 * 3. Extracts paths from arguments and redirects
 * 4. Checks each path against appropriate permissions (read/write)
 * 5. Checks command-specific flags/options
 * 6. Returns the strictest action
 */

import type { SanityConfig } from "./config-types.js";
import type { CheckResult } from "./types.js";

/**
 * Check if a bash command is allowed
 * 
 * @param command - Bash command string to check
 * @param config - Loaded sanity config
 * @returns CheckResult with action and optional reason
 */
export function checkBash(command: string, config: SanityConfig): CheckResult {
  // TODO: Implement
  // 1. Parse command with walkBash
  // 2. For each command found:
  //    a. Look up command config (or use default "_")
  //    b. Evaluate pre-checks (env)
  //    c. Check positional args with specified permissions
  //    d. Check option values
  //    e. Check flags
  //    f. Check redirects (input/output paths)
  // 3. Collect all results, return strictest (deny > ask > allow)
  throw new Error("Not implemented");
}
