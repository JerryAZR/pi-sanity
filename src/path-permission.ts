/**
 * Path permission checking using config
 * Expands variables and evaluates path against permission rules
 */

import * as path from "node:path";
import * as os from "node:os";
import type { Action, PermissionSection, SanityConfig } from "./config-types.js";

/**
 * Check result for a single path
 */
export interface PathCheckResult {
  action: Action;
  reason?: string;
  matchedPattern?: string;
}

/**
 * Context for path expansion
 */
export interface PathContext {
  cwd: string;
  home: string;
  repo?: string;
  tmpdir: string;
}

/**
 * Get default path context using system values
 */
export function getDefaultContext(): PathContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    // repo: detected via git rev-parse --show-toplevel (optional)
  };
}

/**
 * Expand variables in a pattern
 * Supports: {{HOME}}, {{CWD}}, {{REPO}}, {{TMPDIR}}, $ENV_VAR
 */
export function expandPattern(
  pattern: string,
  context: PathContext
): string {
  let result = pattern;

  // Expand {{VAR}} syntax
  result = result.replace(/\{\{HOME\}\}/g, context.home);
  result = result.replace(/\{\{CWD\}\}/g, context.cwd);
  result = result.replace(/\{\{REPO\}\}/g, context.repo ?? context.cwd);
  result = result.replace(/\{\{TMPDIR\}\}/g, context.tmpdir);

  // Expand $ENV_VAR syntax
  result = result.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, varName) => {
    return process.env[varName] ?? `$${varName}`;
  });

  // Normalize path to remove double slashes
  result = result.replace(/\/+/g, "/");

  return result;
}

/**
 * Check if a path matches a glob pattern
 * Requires Node.js 22+ for path.matchesGlob
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  // Normalize paths for cross-platform matching
  const normalizedPath = filePath.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  // @ts-ignore - matchesGlob is available in Node 22+
  return path.matchesGlob(normalizedPath, normalizedPattern);
}

/**
 * Check a path against a permission section (read/write/delete)
 * Returns the strictest matching action
 */
export function checkPathPermission(
  filePath: string,
  permission: PermissionSection,
  context: PathContext
): PathCheckResult {
  // Start with default action
  let result: PathCheckResult = {
    action: permission.default,
    reason: permission.reason,
  };

  // Check each override in order (last match wins)
  for (const override of permission.overrides) {
    for (const pattern of override.path) {
      const expandedPattern = expandPattern(pattern, context);

      if (matchesGlob(filePath, expandedPattern)) {
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
  context?: PathContext
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
  context?: PathContext
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
  context?: PathContext
): PathCheckResult {
  const ctx = context ?? getDefaultContext();
  return checkPathPermission(filePath, config.permissions.delete, ctx);
}
