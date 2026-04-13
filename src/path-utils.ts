/**
 * Path preprocessing utilities
 * Expands tildes, variables, and normalizes paths
 * No checking logic - pure preprocessing only
 */

import { normalize, resolve, isAbsolute, posix } from "node:path";

export interface PathContext {
  cwd: string;
  home: string;
  repo?: string;
  tmpdir: string;
}

export interface PreprocessOptions {
  /** Expand ~ to home directory (default: true) */
  expandTilde?: boolean;
  /** Expand {{VAR}} syntax (default: true for config, false for runtime) */
  expandBraces?: boolean;
  /** Expand $ENV_VAR syntax (default: true) */
  expandEnvVars?: boolean;
  /** Resolve relative paths to absolute (default: true) */
  resolveRelative?: boolean;
  /** Normalize path separators (default: "forward" for cross-platform) */
  separator?: "native" | "forward";
}

/** Default options for config pattern preprocessing */
const CONFIG_DEFAULTS: PreprocessOptions = {
  expandTilde: true,
  expandBraces: true,
  expandEnvVars: true,
  resolveRelative: true,
  separator: "forward",
};

/** Default options for runtime path preprocessing */
const RUNTIME_DEFAULTS: PreprocessOptions = {
  expandTilde: true,
  expandBraces: false,
  expandEnvVars: true,
  resolveRelative: true,
  separator: "forward",
};

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
export function expandTilde(input: string, homeDir: string): string {
  return input.replace(TILDE_REGEX, homeDir);
}

/**
 * Expand {{VAR}} syntax: {{HOME}}, {{CWD}}, {{REPO}}, {{TMPDIR}}
 */
export function expandBraces(input: string, context: PathContext): string {
  return input
    .replace(/\{\{HOME\}\}/g, context.home)
    .replace(/\{\{CWD\}\}/g, context.cwd)
    .replace(/\{\{REPO\}\}/g, context.repo ?? context.cwd)
    .replace(/\{\{TMPDIR\}\}/g, context.tmpdir);
}

/**
 * Expand $ENV_VAR syntax
 */
export function expandEnvVars(input: string): string {
  return input.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, varName) => {
    return process.env[varName] ?? `$${varName}`;
  });
}

/**
 * Normalize path separators to forward slashes for cross-platform compatibility.
 * picomatch treats backslashes as escape characters, so we need forward slashes.
 */
export function normalizeSeparators(input: string): string {
  // Replace all backslashes with forward slashes
  return input.replace(/\\/g, "/");
}

/**
 * Strip Windows drive letters to make paths consistent across platforms.
 * C:/path/to/file -> /path/to/file
 * D:/data/file.txt -> /data/file.txt
 * 
 * This allows patterns like slash-star-star-slash-node_modules to match on both Unix and Windows.
 * Warning: this means C:/file and D:/file become the same path (/file).
 */
export function stripDriveLetter(input: string): string {
  // Match Windows drive letter pattern (e.g., C:, D:, etc.)
  return input.replace(/^[a-zA-Z]:(?=\/)/, "");
}

/**
 * Unified path preprocessing function.
 * 
 * Handles both config patterns and runtime paths with appropriate defaults.
 * Use preprocessConfigPattern() or preprocessRuntimePath() for convenience.
 */
export function preprocessPath(
  input: string,
  context: PathContext,
  options: PreprocessOptions = {},
): string {
  const opts = { ...RUNTIME_DEFAULTS, ...options };
  let result = input;

  // Step 1: Expand tilde
  if (opts.expandTilde) {
    result = expandTilde(result, context.home);
  }

  // Step 2: Expand {{VAR}} syntax
  if (opts.expandBraces) {
    result = expandBraces(result, context);
  }

  // Step 3: Expand $ENV_VAR syntax
  if (opts.expandEnvVars) {
    result = expandEnvVars(result);
  }

  // Step 4: Resolve relative paths to absolute
  if (opts.resolveRelative && !isAbsolute(result)) {
    result = resolve(context.cwd, result);
  }

  // Step 5: Normalize path (handle . and ..)
  result = normalize(result);

  // Step 6: Normalize separators (forward slashes for cross-platform)
  if (opts.separator === "forward") {
    result = normalizeSeparators(result);
  }

  // Step 7: Strip trailing slashes (except for root "/")
  // This ensures consistent behavior across platforms
  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  // Step 8: Strip Windows drive letters for cross-platform consistency
  // C:/path becomes /path, matching Unix-style paths
  result = stripDriveLetter(result);

  return result;
}

/**
 * Preprocess a config pattern for glob matching.
 * Expands all variables and normalizes to forward slashes.
 * 
 * Example: "{{HOME}}/**" -> "/home/user/**"
 * Note: patterns starting with slash-star-star match anywhere
 */
export function preprocessConfigPattern(
  pattern: string,
  context: PathContext,
): string {
  // Patterns starting with /** should match anywhere (absolute glob)
  // Patterns starting with ** (no leading slash) are relative and resolve to CWD
  if (pattern.startsWith("/**")) {
    return preprocessPath(pattern, context, { ...CONFIG_DEFAULTS, resolveRelative: false });
  }
  return preprocessPath(pattern, context, CONFIG_DEFAULTS);
}

/**
 * Preprocess a runtime file path for checking.
 * Expands tilde and env vars, resolves to absolute, normalizes to forward slashes.
 * 
 * Example: "~/.bashrc" -> "/home/user/.bashrc"
 * Example: "$HOME/.bashrc" -> "/home/user/.bashrc"
 * Example: "file.txt" -> "/project/file.txt"
 */
export function preprocessRuntimePath(
  filePath: string,
  context: PathContext,
): string {
  return preprocessPath(filePath, context, RUNTIME_DEFAULTS);
}

/**
 * @deprecated Use preprocessRuntimePath() instead
 */
export function normalizeFilePath(filePath: string, context: PathContext): string {
  return preprocessRuntimePath(filePath, context);
}

/**
 * @deprecated Use preprocessConfigPattern() instead
 */
export function preprocessPath_legacy(
  pattern: string,
  context: PathContext,
): string {
  return preprocessConfigPattern(pattern, context);
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
