/**
 * Bash command check - post-parse checking
 * 
 * 1. Parse bash command to AST
 * 2. Walk AST to extract commands and redirects
 * 3. Apply checks in order: redirects first, then command-specific
 * 4. Return highest priority result (deny > ask > allow)
 */

import type { CheckResult } from "./types.js";
import { walkBash } from "./bash-walker.js";
import { checkRead, type ReadCheckContext } from "./read-check.js";
import { checkWrite, type WriteCheckContext } from "./write-check.js";
import { isFileCommand } from "./bash-analyzer.js";

export interface BashCheckContext extends ReadCheckContext, WriteCheckContext {}

/**
 * Check a bash command by parsing and applying appropriate checks
 */
export function checkBash(command: string, ctx: BashCheckContext, cwd: string): CheckResult {
  const walkResult = walkBash(command);
  const results: CheckResult[] = [];

  for (const cmd of walkResult.commands) {
    // Check redirects first (applies to all commands, even without name)
    for (const redirect of cmd.redirects) {
      const resolved = resolvePath(redirect.target, cwd);
      
      if (redirect.isInput) {
        const result = checkRead(resolved, ctx);
        results.push(result);
        if (result.action === "deny") return result; // Early exit on deny
      }
      
      if (redirect.isOutput) {
        const result = checkWrite(resolved, ctx);
        results.push(result);
        if (result.action === "deny") return result;
      }
    }

    // Check command-specific behavior
    if (cmd.name) {
      const result = checkCommand(cmd.name, cmd.args, ctx, cwd);
      results.push(result);
      if (result.action === "deny") return result;
    }
  }

  // Return highest priority result
  return prioritizeResults(results);
}

/**
 * Route to command-specific checker based on name
 * Placeholders for now
 */
function checkCommand(name: string, args: string[], ctx: BashCheckContext, cwd: string): CheckResult {
  switch (name.toLowerCase()) {
    case "rm":
    case "rmdir":
      return checkRemoveCommand(args, ctx, cwd);
    
    case "cp":
      return checkCopyCommand(args, ctx, cwd);
    
    case "mv":
      return checkMoveCommand(args, ctx, cwd);
    
    case "dd":
      return checkDdCommand(args, ctx, cwd);
    
    default:
      // For file commands like cat, grep, etc., check read on arguments
      if (isFileCommand(name)) {
        return checkGenericFileCommand(name, args, ctx, cwd);
      }
      return { action: "allow" };
  }
}

import { checkRemove, type RemoveCheckContext } from "./remove-check.js";

// Placeholder checkers - implement later
function checkRemoveCommand(args: string[], ctx: BashCheckContext & RemoveCheckContext, cwd: string): CheckResult {
  // Skip flags and check each target
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    const resolved = resolvePath(arg, cwd);
    const result = checkRemove(resolved, ctx);
    if (result.action !== "allow") return result;
  }
  return { action: "allow" };
}

function checkCopyCommand(args: string[], ctx: BashCheckContext, cwd: string): CheckResult {
  // Skip flags
  const targets = args.filter(arg => !arg.startsWith("-"));
  if (targets.length < 2) return { action: "allow" };

  // All but last are sources - check read
  for (let i = 0; i < targets.length - 1; i++) {
    const resolved = resolvePath(targets[i], cwd);
    const result = checkRead(resolved, ctx);
    if (result.action !== "allow") return result;
  }

  // Last is destination - check write
  const dest = resolvePath(targets[targets.length - 1], cwd);
  return checkWrite(dest, ctx);
}

function checkMoveCommand(args: string[], ctx: BashCheckContext, cwd: string): CheckResult {
  // TODO: Check read/write on both ends
  return { action: "allow" };
}

function checkDdCommand(args: string[], ctx: BashCheckContext, cwd: string): CheckResult {
  // TODO: Check for dangerous disk operations
  return { action: "allow" };
}

/**
 * Check generic file commands (cat, grep, head, etc.)
 * Assumes arguments are files to be read
 */
function checkGenericFileCommand(name: string, args: string[], ctx: BashCheckContext, cwd: string): CheckResult {
  // Skip flags
  const targets = args.filter(arg => !arg.startsWith("-"));
  
  for (const target of targets) {
    const resolved = resolvePath(target, cwd);
    const result = checkRead(resolved, ctx);
    if (result.action !== "allow") return result;
  }
  
  return { action: "allow" };
}

/**
 * Return the highest priority result
 * deny > ask > allow
 */
function prioritizeResults(results: CheckResult[]): CheckResult {
  if (results.length === 0) {
    return { action: "allow" };
  }

  const priority = { deny: 3, ask: 2, allow: 1 };
  return results.reduce((worst, current) => {
    return priority[current.action] > priority[worst.action] ? current : worst;
  });
}

/**
 * Resolve a potentially relative path
 */
function resolvePath(path: string, cwd: string): string {
  if (path.startsWith("/") || path.startsWith("\\")) {
    return path;
  }
  if (/^[a-zA-Z]:[/\\]/.test(path)) {
    return path;
  }
  if (path.startsWith("~")) {
    return path;
  }
  return `${cwd}/${path}`;
}
