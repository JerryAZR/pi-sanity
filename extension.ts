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

// Default ask timeout in seconds (placeholder for future use)
const DEFAULT_ASK_TIMEOUT = 30;

export default function (pi: ExtensionAPI) {
  // Load configuration with lazy reload on file changes
  const configManager = new ConfigManager(process.cwd());

  /**
   * Show or refresh the persistent config-warning widget.
   * Call when warnings exist but haven't been drained yet.
   */
  function showBanner(ctx: { hasUI: boolean; ui: { setWidget: (key: string, content: string[] | undefined, opts?: any) => void } }) {
    if (ctx.hasUI) {
      ctx.ui.setWidget(
        "pi-sanity-warn",
        ["⚠ pi-sanity: config warning — details will appear on next tool call"],
        { placement: "aboveEditor" },
      );
    }
  }

  /**
   * Drain warnings via notify() and clear the banner.
   * Call from tool_call where UI is fully reliable.
   */
  function drainAndNotify(ctx: { hasUI: boolean; ui: { notify: (msg: string, type: "warning") => void; setWidget: (key: string, content: string[] | undefined, opts?: any) => void } }) {
    for (const warning of configManager.drainWarnings()) {
      if (ctx.hasUI) {
        ctx.ui.notify(warning, "warning");
      }
    }
    if (ctx.hasUI) {
      ctx.ui.setWidget("pi-sanity-warn", undefined);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    // Startup or /reload: banner survives session-history rendering.
    if (configManager.hasWarnings()) {
      showBanner(ctx);
    }
  });

  pi.on("tool_result", async (_event, ctx) => {
    // Detect config changes immediately after a tool executes
    // (e.g. a write/edit tool that modified a config file).
    configManager.get();
    if (configManager.hasWarnings()) {
      showBanner(ctx);
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    // Reload if needed, then drain and display any warnings.
    const config = configManager.get();
    drainAndNotify(ctx);

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
      // Hard deny - no user prompt
      const reason = result.reason || `${event.toolName} blocked by policy`;

      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked: ${reason}`, "warning");
      }

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

      const confirmed = await ctx.ui.confirm(
        "Pi-Sanity",
        `${reason}\n\n${actionDetails}\n\nAllow this operation?`,
        { timeout: DEFAULT_ASK_TIMEOUT * 1000 }
      );

      if (!confirmed) {
        return { block: true, reason: `${reason} (blocked by user)` };
      }

      // User confirmed - allow the operation
      return undefined;
    }

    // "allow" - let the tool execute normally
    return undefined;
  });
}
