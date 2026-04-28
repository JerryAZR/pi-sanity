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
  ConfigManager,
} from "./src/index.js";
import type { SanityConfig } from "./src/config-types.js";

// Choice labels shown in the select dialog — must match exactly
const CHOICE_ALLOW = "Allow";
const CHOICE_BLOCK = "Block — agent may try alternative";
const CHOICE_BLOCK_STOP = "Block & stop — I'll explain in chat";

export default function (pi: ExtensionAPI) {
  // Load configuration with lazy reload on file changes
  const configManager = new ConfigManager(process.cwd());

  /**
   * Reload config if files changed, drain warnings, and display them via
   * a persistent widget (the only UI primitive that works reliably across
   * session_start, tool_result, and tool_call).
   * Returns the current config for use by tool_call.
   */
  function refreshConfig(ctx: { hasUI: boolean; ui: any }): SanityConfig {
    const config = configManager.get();
    const warnings = configManager.drainWarnings();
    if (ctx.hasUI) {
      if (warnings.length > 0) {
        ctx.ui.setWidget(
          "pi-sanity-warn",
          (_tui: any, theme: any) => ({
            render(width: number): string[] {
              const rule = theme.fg("warning", "─".repeat(Math.max(1, width)));
              return [
                rule,
                ...warnings.map((w) => theme.fg("warning", w)),
                rule,
              ];
            },
            invalidate() {},
          }),
          { placement: "aboveEditor" },
        );
      } else {
        ctx.ui.setWidget("pi-sanity-warn", undefined);
      }
    }
    return config;
  }

  pi.on("session_start", async (_event, ctx) => {
    refreshConfig(ctx);
  });

  pi.on("tool_result", async (_event, ctx) => {
    refreshConfig(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = refreshConfig(ctx);

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

    // Handle different actions
    if (!result) {
      return undefined;
    }

    if (result.action === "deny") {
      // Hard deny - no user prompt. The reason is shown in the tool result
      // output; no separate notify() needed since we use the widget for all
      // persistent warnings.
      const reason = result.reason || `${event.toolName} blocked by policy`;
      return { block: true, reason };
    }

    if (result.action === "ask") {
      // Ask user for confirmation
      const reason = result.reason || `${event.toolName} requires confirmation`;

      if (!ctx.hasUI) {
        // No UI available (e.g., print mode) - treat ask as deny
        return { block: true, reason: `${reason} (no UI available)` };
      }

      // Build message showing what action is being attempted
      let actionDetails = "";
      switch (event.toolName) {
        case "read":
          actionDetails = `Read file: ${event.input.path}`;
          break;
        case "write":
          actionDetails = `Write file: ${event.input.path}`;
          break;
        case "edit":
          actionDetails = `Edit file: ${event.input.path}`;
          break;
        case "bash":
          actionDetails = `Run command: ${event.input.command}`;
          break;
      }

      const timeoutMs = (config.ask_timeout ?? 30) * 1000;

      const title = `Pi-Sanity\n\n${reason}\n${actionDetails}`;

      const choice = await ctx.ui.select(
        title,
        [CHOICE_ALLOW, CHOICE_BLOCK, CHOICE_BLOCK_STOP],
        { timeout: timeoutMs }
      );

      if (choice === CHOICE_ALLOW) {
        // User confirmed - allow the operation
        return undefined;
      }

      if (choice === CHOICE_BLOCK_STOP) {
        // User wants to explain or redirect the agent.
        // Abort the agent turn so the user can type in the main chat input.
        // Deferred via setTimeout so the block result is processed first.
        setTimeout(() => ctx.abort(), 0);
      }

      // "Block" (without stopping): the agent turn continues and sees the
      // rejection reason. It may give up or try an alternative approach.
      // Also applies when the dialog is dismissed or times out.
      return { block: true, reason: `${reason} (blocked by user)` };
    }

    // "allow" - let the tool execute normally
    return undefined;
  });
}
