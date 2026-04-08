/**
 * Bash AST walker - traverses unbash parse tree
 * Extracts commands and redirects for checking
 */

import { parse } from "unbash";
import type { Script, Node, Command, Statement, Pipeline, Redirect } from "unbash/types";

export interface WalkResult {
  commands: FoundCommand[];
}

export interface FoundCommand {
  name?: string;  // undefined for redirect-only commands
  args: string[]; // suffix words (raw text)
  redirects: FoundRedirect[]; // includes both command-level and statement-level
}

export interface FoundRedirect {
  operator: string;
  target: string;
  isInput: boolean;
  isOutput: boolean;
}

/**
 * Walk the AST and extract all commands with their redirects
 */
export function walkBash(command: string): WalkResult {
  const ast = parse(command);
  const commands: FoundCommand[] = [];

  function walk(node: Node | Script | null): void {
    if (!node) return;

    switch (node.type) {
      case "Script": {
        for (const stmt of (node as Script).commands) {
          walk(stmt);
        }
        break;
      }

      case "Statement": {
        const stmt = node as Statement;
        // Check statement-level redirects too
        const stmtRedirects = extractRedirects(stmt.redirects);
        if (stmtRedirects.length > 0) {
          // Add a virtual command for statement-level redirects
          commands.push({
            name: undefined,
            args: [],
            redirects: stmtRedirects,
          });
        }
        walk(stmt.command);
        break;
      }

      case "Pipeline":
      case "AndOr": {
        // @ts-expect-error
        for (const cmd of node.commands) {
          walk(cmd);
        }
        break;
      }

      case "Command": {
        const cmd = node as Command;
        const cmdRedirects = extractRedirects(cmd.redirects);
        
        // Even if no name, capture redirects (for " > file" syntax)
        if (cmd.name?.text || cmdRedirects.length > 0) {
          commands.push({
            name: cmd.name?.text,
            args: cmd.suffix?.map((w) => w.text) ?? [],
            redirects: cmdRedirects,
          });
        }
        break;
      }

      case "Subshell":
      case "BraceGroup": {
        // @ts-expect-error
        const body = node.body;
        if (body?.commands) {
          for (const stmt of body.commands) {
            walk(stmt);
          }
        }
        break;
      }

      case "If": {
        // @ts-expect-error
        const ifNode = node as { clause: { commands: Statement[] }; then: { commands: Statement[] }; else?: Node };
        for (const stmt of ifNode.clause.commands) walk(stmt);
        for (const stmt of ifNode.then.commands) walk(stmt);
        if (ifNode.else) walk(ifNode.else);
        break;
      }

      case "While":
      case "Until": {
        // @ts-expect-error
        const loopNode = node as { clause: { commands: Statement[] }; body: { commands: Statement[] } };
        for (const stmt of loopNode.clause.commands) walk(stmt);
        for (const stmt of loopNode.body.commands) walk(stmt);
        break;
      }

      case "For": {
        // @ts-expect-error
        const forBody = node.body;
        if (forBody?.commands) {
          for (const stmt of forBody.commands) {
            walk(stmt);
          }
        }
        break;
      }

      case "Function": {
        // @ts-expect-error
        walk(node.body);
        break;
      }

      default:
        break;
    }
  }

  walk(ast);
  return { commands };
}

function extractRedirects(redirects: Redirect[] | undefined): FoundRedirect[] {
  if (!redirects) return [];

  return redirects.map((r) => {
    const op = r.operator;
    return {
      operator: op,
      target: r.target?.text ?? "",
      isInput: op === "<" || op === "<<" || op === "<<<",
      isOutput: op === ">" || op === ">>" || op === ">&" || op === ">&>" || op === ">>|",
    };
  });
}

// Demo
if (import.meta.main) {
  const testCommands = [
    "rm -rf ~",
    "cat file.txt | grep pattern > output.txt",
    "> output.txt",
    "(cd /tmp && rm file)",
  ];

  for (const cmd of testCommands) {
    console.log("\n" + "=".repeat(50));
    console.log("Command:", cmd);
    const result = walkBash(cmd);
    console.log("Found:", JSON.stringify(result.commands, null, 2));
  }
}
