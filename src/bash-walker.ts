/**
 * Bash AST walker - traverses unbash parse tree
 * Extracts commands and redirects for checking
 */

import { parse } from "unbash";
import type { Script, Node, Command, Statement, Pipeline, Redirect } from "../node_modules/unbash/dist/types.d.ts";

export interface WalkResult {
  commands: FoundCommand[];
}

export interface FoundCommand {
  name?: string;
  args: string[];
  redirects: FoundRedirect[];
}

export interface FoundRedirect {
  operator: string;
  target: string;
  isInput: boolean;
  isOutput: boolean;
}

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
        const stmtRedirects = extractRedirects(stmt.redirects);
        if (stmtRedirects.length > 0) {
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
        for (const cmd of (node as Pipeline).commands) {
          walk(cmd);
        }
        break;
      }

      case "Command": {
        const cmd = node as Command;
        const cmdRedirects = extractRedirects(cmd.redirects);
        if (cmd.name?.text || cmdRedirects.length > 0) {
          commands.push({
            name: cmd.name?.text,
            args: cmd.suffix?.map((w: { text: string }) => w.text) ?? [],
            redirects: cmdRedirects,
          });
        }
        break;
      }

      case "Subshell":
      case "BraceGroup": {
        const body = (node as { body: { commands: Statement[] } }).body;
        if (body?.commands) {
          for (const stmt of body.commands) {
            walk(stmt);
          }
        }
        break;
      }

      case "If": {
        const ifNode = node as { clause: { commands: Statement[] }; then: { commands: Statement[] }; else?: Node };
        for (const stmt of ifNode.clause.commands) walk(stmt);
        for (const stmt of ifNode.then.commands) walk(stmt);
        if (ifNode.else) walk(ifNode.else);
        break;
      }

      case "While": {
        const loopNode = node as { clause: { commands: Statement[] }; body: { commands: Statement[] } };
        for (const stmt of loopNode.clause.commands) walk(stmt);
        for (const stmt of loopNode.body.commands) walk(stmt);
        break;
      }

      case "For": {
        const forBody = (node as { body: { commands: Statement[] } }).body;
        if (forBody?.commands) {
          for (const stmt of forBody.commands) {
            walk(stmt);
          }
        }
        break;
      }

      case "Function": {
        walk((node as { body: Node }).body);
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
      isOutput: op === ">" || op === ">>" || op === ">&" || op === "&>" || op === "&>>" || op === ">|",
    };
  });
}

// @ts-ignore - import.meta.main not in types
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
