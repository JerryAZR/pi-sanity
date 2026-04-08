/**
 * Path utility functions using Node.js built-in modules
 */

import { resolve, relative, sep } from "node:path";
import { tmpdir } from "node:os";

const SYSTEM_TEMP = tmpdir().toLowerCase();

/** Check if path is inside parent (descendant, not equal) */
export function isInside(path: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(path));
  return !rel.startsWith('..') && rel !== '';
}

/** Check if path is temp directory or inside it */
export function isTemp(path: string): boolean {
  const rel = relative(SYSTEM_TEMP, resolve(path));
  return !rel.startsWith('..') && rel !== '';
}

/** Check if path is a hidden file/directory in home (relative path starts with .) */
export function isHomeHidden(path: string, homeDir: string): boolean {
  const rel = relative(resolve(homeDir), resolve(path));
  // Hidden if relative path starts with . but not .. (which means outside home)
  return rel.startsWith('.') && !rel.startsWith('..');
}

/** Check if file is a public key (safe to read) */
export function isPublicKeyFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.pub') || lower.endsWith('.asc');
}

/** Check if write target is protected (.git/) */
export function isGitPath(path: string): boolean {
  const lower = resolve(path).toLowerCase();
  return lower.includes(sep + '.git' + sep) || lower.endsWith(sep + '.git');
}

/** Expand ~ to home directory */
export function expandTilde(path: string, homeDir: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~/', homeDir + sep);
  }
  if (path === '~') {
    return homeDir;
  }
  return path;
}
