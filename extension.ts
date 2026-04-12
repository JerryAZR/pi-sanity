/**
 * Pi-Sanity Pi Extension
 *
 * Integrates pi-sanity with Pi's tool system to provide sanity checks
 * on read, write, edit, and bash operations.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  checkRead,
  checkWrite,
  checkBash,
  loadConfig,
  type SanityConfig,
} from "./src/index.js";

// Default ask timeout in seconds (placeholder for future use)
const DEFAULT_ASK_TIMEOUT = 30;

export default function (pi: ExtensionAPI) {
  // Load configuration
  const config = loadConfig();

  pi.on("tool_call", async (event, ctx) => {
    // Only handle built-in tools we care about
    if (!["read", "write", "edit", "bash"].includes(event.toolName)) {
      return undefined;
    }

    let result;

    switch (event.toolName) {
      case "read": {
        const path = event.input.path as string;
        if (!path) {
          return { block: true, reason: "No path specified for read operation" };
        }
        result = checkRead(path, config);
        break;
      }

      case "write":
      case "edit": {
        const path = event.input.path as string;
        if (!path) {
          return { block: true, reason: `No path specified for ${event.toolName} operation` };
        }
        result = checkWrite(path, config);
        break;
      }

      case "bash": {
        const command = event.input.command as string;
        if (!command) {
          return { block: true, reason: "No command specified for bash operation" };
        }
        result = checkBash(command, config);
        break;
      }
    }

    // Map "ask" to "deny" for now (simplest approach)
    // result should always be defined for handled tools
    if (!result) {
      return undefined;
    }
    
    if (result.action === "deny" || result.action === "ask") {
      const reason = result.reason || `${event.toolName} blocked by policy`;
      
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked: ${reason}`, "warning");
      }
      
      return { block: true, reason };
    }

    // "allow" - let the tool execute normally
    return undefined;
  });
}
