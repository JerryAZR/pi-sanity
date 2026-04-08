/**
 * Check for npm/yarn/pnpm global operations
 */

import type { CheckResult } from "./types.ts";

/**
 * Check action for npm/yarn/pnpm commands
 * 
 * - allow: local operations
 * - ask: global operations
 */
export function checkNpmGlobal(command: string): CheckResult {
  const parts = command.trim().toLowerCase().split(/\s+/);
  const [cmd, subcmd] = parts;

  // npm global patterns
  if (cmd === "npm") {
    if (["install", "i", "uninstall", "rm", "remove"].includes(subcmd)) {
      if (parts.includes("-g") || parts.includes("--global")) {
        return { action: "ask", reason: "npm global operation" };
      }
    }
    if (subcmd === "link" && (parts.includes("-g") || parts.includes("--global"))) {
      return { action: "ask", reason: "npm global link" };
    }
  }

  // yarn global patterns
  if (cmd === "yarn" && subcmd === "global") {
    return { action: "ask", reason: "yarn global operation" };
  }

  // pnpm global patterns
  if (cmd === "pnpm") {
    if (["add", "remove"].includes(subcmd)) {
      if (parts.includes("-g") || parts.includes("--global")) {
        return { action: "ask", reason: "pnpm global operation" };
      }
    }
  }

  // Local operations: allow
  return { action: "allow" };
}
