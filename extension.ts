/**
 * Pi-Sanity Pi Extension
 *
 * Integrates pi-sanity with Pi's tool system to provide sanity checks
 * on read, write, edit, and bash operations.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  checkRead,
  checkWrite,
  checkBash,
  ConfigManager,
} from "./src/index.js";
import type { SanityConfig } from "./src/config-types.js";

// Choice labels shown in the select dialog — must match exactly.
// The "agent continues its turn" suffix is intentional: in some other agents
// "Block" means stop. Pi keeps the turn running, and the label makes that clear.
const CHOICE_ALLOW = "Allow";
const CHOICE_BLOCK_CONTINUE = "Block — agent continues its turn";
const CHOICE_BLOCK_REASON = "Block with reason…";

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
        if (!path) return undefined;
        result = checkRead(path, config);
        break;
      }

      case "write":
      case "edit": {
        const path = event.input.path as string;
        if (!path) return undefined;
        result = checkWrite(path, config);
        break;
      }

      case "bash": {
        const command = event.input.command as string;
        if (!command) return undefined;
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
        [CHOICE_ALLOW, CHOICE_BLOCK_CONTINUE, CHOICE_BLOCK_REASON],
        { timeout: timeoutMs }
      );

      if (choice === CHOICE_ALLOW) {
        // User confirmed - allow the operation
        return undefined;
      }

      if (choice === CHOICE_BLOCK_REASON) {
        // User chose to provide a custom rejection reason. Opt-in, no
        // timeout: a user who walked away won't select this branch. Esc or
        // empty submit falls back to the default block reason (the operation
        // is still blocked — Esc never un-blocks).
        const custom = await ctx.ui.input("Reason for blocking (Esc to skip)");
        const trimmed = custom?.trim();
        if (trimmed) {
          return { block: true, reason: trimmed };
        }
      }

      // "Block — agent continues its turn": the agent turn continues. The
      // agent receives a tool failure and should report it to the user
      // rather than silently trying workarounds. Also applies when the
      // dialog is dismissed/timed out, or when the custom-reason input was
      // skipped (Esc / empty).
      return {
        block: true,
        reason: `${reason} (blocked by user)`,
      };
    }

    // "allow" - let the tool execute normally
    return undefined;
  });
}
