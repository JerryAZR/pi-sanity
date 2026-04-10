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

  // Step 4: Use Node.js normalize to handle separators properly
  result = normalize(result);

  return result;
}
