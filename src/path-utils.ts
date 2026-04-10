/**
 * Path preprocessing utilities
 * Expands tildes, variables, and normalizes paths
 * No checking logic - pure preprocessing only
 */

import { normalize } from "node:path";

export interface PathContext {
  cwd: string;
  home: string;
  repo?: string;
  tmpdir: string;
}

/**
 * Regex to match ~ at end-of-string OR followed by path separator
 * Matches: "~", "~/...", "~\..."
 * Does NOT match: "~user", "abc~def"
 */
const TILDE_REGEX = /^~(?=$|[/\\])/;

/**
 * Expand ~ to home directory
 * Handles: "~", "~/file", "~\file"
 */
export function expandTilde(path: string, homeDir: string): string {
  return path.replace(TILDE_REGEX, homeDir);
}

/**
 * Expand {{VAR}} syntax: {{HOME}}, {{CWD}}, {{REPO}}, {{TMPDIR}}
 */
export function expandBraces(pattern: string, context: PathContext): string {
  return pattern
    .replace(/\{\{HOME\}\}/g, context.home)
    .replace(/\{\{CWD\}\}/g, context.cwd)
    .replace(/\{\{REPO\}\}/g, context.repo ?? context.cwd)
    .replace(/\{\{TMPDIR\}\}/g, context.tmpdir);
}

/**
 * Expand $ENV_VAR syntax
 */
export function expandEnvVars(pattern: string): string {
  return pattern.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, varName) => {
    return process.env[varName] ?? `$${varName}`;
  });
}

/**
 * Full path preprocessing pipeline:
 * 1. Expand tildes (~)
 * 2. Expand {{VARS}}
 * 3. Expand $ENV_VARS
 * 4. Normalize path separators
 */
export function preprocessPath(
  pattern: string,
  context: PathContext,
): string {
  let result = pattern;

  // Step 1: Tilde expansion
  result = expandTilde(result, context.home);

  // Step 2: {{VAR}} expansion
  result = expandBraces(result, context);

  // Step 3: $ENV_VAR expansion
  result = expandEnvVars(result);

  // Step 4: Normalize separators (always use forward slashes for glob compatibility)
  result = normalizeForGlob(result);

  return result;
}

/**
 * Check if a string contains characters that make it impossible to be a valid path.
 * 
 * Forbidden characters:
 * - Null byte (\0) - never valid in any OS
 * - Control characters (0x01-0x1F) - invalid on Windows, problematic on Unix
 * - Windows reserved: < > : " | ? *
 * 
 * Note: Empty string is also invalid as a path.
 */
export function clearlyNotAPath(str: string): boolean {
  // Empty string - not a path
  if (!str || str.length === 0) return true;

  // Null bytes - never valid in any filename
  if (str.includes('\0')) return true;

  // Control characters (0x01-0x1F) - invalid on Windows
  if (/[\x01-\x1F]/.test(str)) return true;

  // Windows reserved characters (except colon which is allowed for drive letters)
  if (/[<>"|?*]/.test(str)) return true;
  
  // Colon is only allowed as drive letter separator at position 1 (e.g., "C:")
  if (/:/.test(str) && !/^.:/.test(str)) return true;

  return false;
}

/**
 * Normalize path for cross-platform glob matching.
 * Converts backslashes to forward slashes for consistent glob patterns.
 * Also applies Node.js normalize for . and .. resolution.
 */
export function normalizeForGlob(path: string): string {
  // First apply Node.js normalize (handles . and ..)
  const normalized = normalize(path);
  // Then convert backslashes to forward slashes
  return normalized.replace(/\\/g, "/");
}
