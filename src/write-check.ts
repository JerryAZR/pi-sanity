/**
 * Write checks - determine action for file writes
 */

import { resolve } from "node:path";
import type { CheckResult } from "./types.js";
import { isInside, isTemp, isGitPath, expandTilde } from "./path-utils.js";

export interface WriteCheckContext {
  projectRoot: string;
  homeDir: string;
}

/**
 * Check action for a file write
 * 
 * - deny: writing to .git/ directory
 * - allow: inside project (except .git/), temp dirs
 * - ask: outside project
 */
export function checkWrite(path: string, ctx: WriteCheckContext): CheckResult {
  const expanded = expandTilde(path, ctx.homeDir);
  const resolved = resolve(expanded);

  // Temp directories: allow
  if (isTemp(resolved)) {
    return { action: "allow" };
  }

  // Inside project - check for protected paths
  if (isInside(resolved, ctx.projectRoot)) {
    if (isGitPath(resolved)) {
      return {
        action: "deny",
        reason: `Writing to .git directory: ${path}`,
      };
    }
    return { action: "allow" };
  }

  return {
    action: "ask",
    reason: `Writing outside project: ${path}`,
  };
}
