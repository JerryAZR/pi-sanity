/**
 * Remove checks - determine if a path is safe to delete
 */

import { resolve } from "node:path";
import type { CheckResult } from "./types.js";
import { expandTilde } from "./path-utils.js";

export interface RemoveCheckContext {
  homeDir: string;
}

// Paths that should never be deleted
// Format: path[:strict] where strict means exact match only (subdirs allowed)
const PROTECTED_PATHS = [
  "~:strict",    // Home dir - exact match only, subdirs like ~/project allowed
  "/",           // Root dir and ALL subdirs
  "/boot",       // Boot dir and all subdirs
  "/etc",        // System config
  "/home:strict", // /home itself, but /home/user allowed
  "/root",       // Root user home
  "/usr",        // System binaries and all subdirs
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/dev",        // Device files
  "/sys",
  "/proc",
];

/**
 * Check if a path is safe to remove
 * 
 * - deny: system-critical paths (/, ~, /boot, etc.)
 * - allow: everything else
 */
export function checkRemove(path: string, ctx: RemoveCheckContext): CheckResult {
  const expanded = expandTilde(path, ctx.homeDir);
  const resolved = resolve(expanded);
  const lower = resolved.toLowerCase();

  // Check against protected paths
  for (const entry of PROTECTED_PATHS) {
    const [protected_, flag] = entry.split(":");
    const strict = flag === "strict";
    
    const expandedProtected = expandTilde(protected_, ctx.homeDir);
    const resolvedProtected = resolve(expandedProtected).toLowerCase();
    
    // Exact match always denied
    if (lower === resolvedProtected) {
      return {
        action: "deny",
        reason: `Cannot delete protected path: ${path}`,
      };
    }
    
    // Subdir match denied unless strict mode
    if (!strict) {
      if (lower.startsWith(resolvedProtected + "/") || lower.startsWith(resolvedProtected + "\\")) {
        return {
          action: "deny",
          reason: `Cannot delete protected path: ${path}`,
        };
      }
    }
  }

  return { action: "allow" };
}
