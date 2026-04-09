/**
 * Read checks - determine action for file reads
 */

import { resolve } from "node:path";
import type { CheckResult } from "./types.js";
import { isInside, isHomeHidden, isPublicKeyFile, expandTilde } from "./path-utils.js";

export interface ReadCheckContext {
  projectRoot: string;
  homeDir: string;
}

/**
 * Check action for a file read
 * 
 * Only "ask" case: hidden file in home directory (potential secrets)
 * Exception: *.pub files (public keys) are allowed
 * Everything else defaults to "allow"
 */
export function checkRead(path: string, ctx: ReadCheckContext): CheckResult {
  const expanded = expandTilde(path, ctx.homeDir);
  const resolved = resolve(expanded);

  // Only "ask" case: hidden file in home (but not in project, except public keys)
  if (!isInside(resolved, ctx.projectRoot) &&
      isHomeHidden(resolved, ctx.homeDir) && 
      !isPublicKeyFile(resolved)) {
    return {
      action: "ask",
      reason: `Reading hidden file in home: ${path}`,
    };
  }

  return { action: "allow" };
}
