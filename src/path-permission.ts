/**
 * Path permission checking using config
 * Expands variables and evaluates path against permission rules
 */

import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { normalizeFilePath, type PathContext } from "./path-utils.js";
import type { Action, PermissionSection, SanityConfig } from "./config-types.js";

export type { PathContext };

/**
 * Check result for a single path
 */
export interface PathCheckResult {
  action: Action;
  reason?: string;
  matchedPattern?: string;
}

/**
 * Detect git repository root using `git rev-parse --show-toplevel`.
 * Returns undefined if not in a git repository or git is not available.
 */
function detectRepo(): string | undefined {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"], // Suppress stderr
      timeout: 1000, // 1 second timeout
    });
    return result.trim() || undefined;
  } catch {
    // Not in git repo, git not installed, or command failed
    return undefined;
  }
}

/**
 * Get default path context using system values.
 * Attempts to detect git repo, falls back to cwd.
 */
export function getDefaultContext(): PathContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    repo: detectRepo(),
  };
}

/**
 * Check if a normalized path matches a preprocessed glob pattern.
 * Requires Node.js 22+ for path.matchesGlob
 * 
 * Both path and pattern should already be normalized. Patterns are
 * preprocessed at config load time by config-loader.ts.
 * 
 * @param normalizedPath - The already-normalized file path
 * @param pattern - The preprocessed glob pattern from config
 */
export function matchesGlob(normalizedPath: string, pattern: string): boolean {
  // @ts-ignore - matchesGlob is available in Node 22+
  return path.matchesGlob(normalizedPath, pattern);
}

/**
 * Check a path against a permission section (read/write/delete)
 * Returns the strictest matching action
 */
export function checkPathPermission(
  filePath: string,
  permission: PermissionSection,
  context: PathContext,
): PathCheckResult {
  // Start with default action
  let result: PathCheckResult = {
    action: permission.default,
    reason: permission.reason,
  };

  // Normalize the file path once before checking
  const normalizedFilePath = normalizeFilePath(filePath, context);

  // Check each override in order (last match wins)
  for (const override of permission.overrides) {
    for (const pattern of override.path) {
      if (matchesGlob(normalizedFilePath, pattern)) {
        result = {
          action: override.action,
          reason: override.reason,
          matchedPattern: pattern,
        };
        // Don't break - continue to let later overrides take precedence
      }
    }
  }

  return result;
}

/**
 * Check read permission for a path
 */
export function checkRead(
  filePath: string,
  config: SanityConfig,
  context?: PathContext,
): PathCheckResult {
  const ctx = context ?? getDefaultContext();
  return checkPathPermission(filePath, config.permissions.read, ctx);
}

/**
 * Check write permission for a path
 */
export function checkWrite(
  filePath: string,
  config: SanityConfig,
  context?: PathContext,
): PathCheckResult {
  const ctx = context ?? getDefaultContext();
  return checkPathPermission(filePath, config.permissions.write, ctx);
}

/**
 * Check delete permission for a path
 */
export function checkDelete(
  filePath: string,
  config: SanityConfig,
  context?: PathContext,
): PathCheckResult {
  const ctx = context ?? getDefaultContext();
  return checkPathPermission(filePath, config.permissions.delete, ctx);
}
