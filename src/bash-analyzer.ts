/**
 * Bash command analysis using unbash AST
 * More robust than regex for parsing shell commands
 */

// Import from npm package
import { parse } from "unbash";
import type { 
  Script, 
  Node, 
  Command, 
  Pipeline, 
  AndOr, 
  Redirect,
  Statement,
  CompoundList,
  While,
  For,
  If,
  Function as FunctionNode,
  Subshell,
  BraceGroup
} from "unbash/types";
import type { CheckResult } from "./types.ts";

export interface AnalyzedCommand {
  command: string;
  args: string[];
  redirects: RedirectInfo[];
  fullText: string;
}

export interface RedirectInfo {
  operator: string;
  target: string;
}

/**
 * Analyze a bash command and extract all simple commands with their arguments
 */
export function analyzeBash(command: string): AnalyzedCommand[] {
  const ast = parse(command);
  const commands: AnalyzedCommand[] = [];

  walkAst(ast, (node) => {
    if (node.type === "Command") {
      const cmd = extractCommandInfo(node, command);
      if (cmd) commands.push(cmd);
    }
  });

  return commands;
}

/**
 * Extract command name, args, and redirects from a Command node
 */
function extractCommandInfo(cmd: Command, fullText: string): AnalyzedCommand | null {
  const name = cmd.name?.text;
  if (!name) return null;

  // Get arguments from suffix (skip flags starting with -)
  const args: string[] = [];
  for (const word of cmd.suffix) {
    // Use value (unquoted) instead of text (raw)
    const value = word.value ?? word.text;
    // Include the word unless it's a flag
    if (!value.startsWith("-") || value === "--") {
      args.push(value);
    }
  }

  // Extract redirects
  const redirects: RedirectInfo[] = [];
  for (const redir of cmd.redirects ?? []) {
    if (redir.target?.text) {
      redirects.push({
        operator: redir.operator,
        target: redir.target.text,
      });
    }
  }

  return {
    command: name,
    args,
    redirects,
    fullText: fullText.slice(cmd.pos, cmd.end),
  };
}

/**
 * Walk the AST and visit all nodes
 */
function walkAst(node: Node | Script, visitor: (node: Node) => void): void {
  if (!node) return;

  // Visit this node if it's not a Script
  if (node.type !== "Script") {
    visitor(node as Node);
  }

  // Recurse based on node type
  switch (node.type) {
    case "Script":
      for (const stmt of node.commands) {
        walkAst(stmt.command, visitor);
      }
      break;

    case "Statement":
      walkAst(node.command, visitor);
      break;

    case "Pipeline":
      for (const cmd of node.commands) {
        walkAst(cmd, visitor);
      }
      break;

    case "AndOr":
      for (const cmd of node.commands) {
        walkAst(cmd, visitor);
      }
      break;

    case "Command":
      // Terminal - already visited above
      break;

    case "Subshell":
      walkCompoundList(node.body, visitor);
      break;

    case "BraceGroup":
      walkCompoundList(node.body, visitor);
      break;

    case "If":
      walkCompoundList(node.clause, visitor);
      walkCompoundList(node.then, visitor);
      if (node.else) walkAst(node.else, visitor);
      break;

    case "While":
      walkCompoundList(node.clause, visitor);
      walkCompoundList(node.body, visitor);
      break;

    case "For":
      walkCompoundList(node.body, visitor);
      break;

    case "Function":
      walkAst(node.body, visitor);
      break;

    case "CompoundList":
      walkCompoundList(node, visitor);
      break;

    // Ignore other node types for now
    default:
      break;
  }
}

function walkCompoundList(list: CompoundList, visitor: (node: Node) => void): void {
  for (const stmt of list.commands) {
    walkAst(stmt.command, visitor);
  }
}

/**
 * Check if a command is a file operation that needs path checking
 */
export function isFileCommand(cmd: string): boolean {
  const fileCommands = new Set([
    "cat", "less", "more", "head", "tail", "grep", "rg", "find", "ls", "tree",
    "diff", "cmp", "file", "stat", "jq", "yq", "wc", "sha256sum", "md5sum",
    "rm", "rmdir", "mv", "cp", "touch", "mkdir", "chmod", "chown", "truncate",
    "dd", "tee", "ln", "install", "tar", "zip", "unzip", "rsync", "scp", "wget", "curl"
  ]);
  return fileCommands.has(cmd.toLowerCase());
}

/**
 * Get the effective target paths for a command
 * For write commands, returns potential write targets
 */
export function getWriteTargets(analyzed: AnalyzedCommand): string[] {
  const targets: string[] = [];
  const cmd = analyzed.command.toLowerCase();

  // Check redirects first (these are always writes)
  for (const redir of analyzed.redirects) {
    if ([">", ">>", "&>", "&>>"].includes(redir.operator)) {
      targets.push(redir.target);
    }
  }

  // Command-specific argument positions
  switch (cmd) {
    case "mv":
    case "cp":
      // Last arg is destination
      if (analyzed.args.length > 0) {
        targets.push(analyzed.args[analyzed.args.length - 1]);
      }
      break;

    case "dd":
      // dd uses if= and of= syntax
      for (const arg of analyzed.args) {
        if (arg.startsWith("of=")) {
          targets.push(arg.slice(3));
        }
      }
      break;

    case "touch":
    case "mkdir":
    case "truncate":
    case "rm":
    case "rmdir":
      // All args are targets
      targets.push(...analyzed.args);
      break;

    case "tee":
      // All args are output files
      targets.push(...analyzed.args);
      break;

    case "ln":
      // ln [-s] target link_name - last arg is link_name
      if (analyzed.args.length > 0) {
        targets.push(analyzed.args[analyzed.args.length - 1]);
      }
      break;
  }

  return targets.filter(t => t && !t.startsWith("-"));
}

/**
 * Get the source paths for a command (for read checking)
 */
export function getReadSources(analyzed: AnalyzedCommand): string[] {
  const sources: string[] = [];
  const cmd = analyzed.command.toLowerCase();

  // Check input redirects
  for (const redir of analyzed.redirects) {
    if (redir.operator === "<") {
      sources.push(redir.target);
    }
  }

  // Command-specific argument positions
  switch (cmd) {
    case "cat":
    case "less":
    case "more":
    case "head":
    case "tail":
    case "grep":
    case "rg":
    case "jq":
    case "yq":
    case "sha256sum":
    case "md5sum":
    case "file":
    case "stat":
      // All args are sources
      sources.push(...analyzed.args);
      break;

    case "cp":
    case "mv":
      // All args except last are sources
      if (analyzed.args.length > 1) {
        sources.push(...analyzed.args.slice(0, -1));
      }
      break;

    case "dd":
      // dd uses if= for input
      for (const arg of analyzed.args) {
        if (arg.startsWith("if=")) {
          sources.push(arg.slice(3));
        }
      }
      break;

    case "diff":
    case "cmp":
      // All args are sources
      sources.push(...analyzed.args);
      break;

    case "find":
      // First arg is path
      if (analyzed.args.length > 0) {
        sources.push(analyzed.args[0]);
      }
      break;

    case "tar":
      // Look for -f flag
      for (let i = 0; i < analyzed.args.length; i++) {
        if (analyzed.args[i] === "-f" && i + 1 < analyzed.args.length) {
          sources.push(analyzed.args[i + 1]);
        }
      }
      break;
  }

  return sources.filter(s => s && !s.startsWith("-"));
}
