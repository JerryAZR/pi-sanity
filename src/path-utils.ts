/**
 * Path preprocessing utilities
 * Expands tildes, variables, and normalizes paths
 * No checking logic - pure preprocessing only
 */

import { normalize, resolve, isAbsolute } from "node:path";

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
 * Normalize a file path for checking against patterns.
 * Resolves relative paths to absolute and normalizes using Node.js normalize().
 */
export function normalizeFilePath(filePath: string, context: PathContext): string {
  // Resolve relative paths to absolute
  const resolved = isAbsolute(filePath)
    ? filePath
    : resolve(context.cwd, filePath);

  // Normalize (handles . and .., converts to platform-native separators)
  return normalize(resolved);
}

/**
 * Preprocess a pattern from config for glob matching.
 * Expands variables (tilde, braces, env vars) and normalizes the path.
 * 
 * This is for config patterns, not runtime file paths.
 * Uses normalizeFilePath for consistent normalization.
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

  // Step 4: Normalize (handles . and .., converts to platform-native separators)
  // Use normalizeFilePath logic: resolve if needed, then normalize
  result = normalizeFilePath(result, context);

  return result;
}

/**
 * Check if a string contains characters that make it impossible to be a valid path.
 * 
 * DISABLED: Currently always returns false to avoid rejecting valid paths.
 * This function was rejecting valid glob patterns like *.txt and paths with
 * special characters like file#1, causing security bypasses.
 * 
 * TODO: Re-implement with proper path validation if needed, ensuring glob
 * patterns and special characters in paths are handled correctly.
 */
export function clearlyNotAPath(str: string): boolean {
  // DISABLED: Always return false to ensure all paths are checked
  // This prevents security bypasses from valid paths being skipped
  return false;
}
