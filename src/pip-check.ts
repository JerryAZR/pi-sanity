/**
 * Check if pip is using system Python vs project virtual environment
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isInsideProject } from "./path-utils.ts";
import type { CheckResult } from "./types.ts";

/**
 * Check action for pip commands
 * 
 * - allow: using project virtual environment
 * - ask: using system pip outside project venv
 */
export async function checkPip(
  pi: ExtensionAPI,
  projectRoot: string,
  command: string
): Promise<CheckResult> {
  // Only check pip commands (not pip3, python -m pip, etc.)
  if (!isPipCommand(command)) {
    return { action: "allow" };
  }

  // Skip info-only commands
  if (isInfoCommand(command)) {
    return { action: "allow" };
  }

  try {
    const result = await pi.exec("pip", ["--version"], { timeout: 5000 });
    const match = result.stdout.match(/from\s+(.+?)\s+\(python/i);

    if (!match) {
      return {
        action: "ask",
        reason: "Could not determine pip location",
      };
    }

    const pipPath = match[1];
    const isInProject = isInsideProject(pipPath, projectRoot);

    return isInProject
      ? { action: "allow" }
      : {
          action: "ask",
          reason: "Using system pip outside project virtual environment",
        };
  } catch {
    return {
      action: "ask",
      reason: "pip --version failed",
    };
  }
}

/** Check if command is a pip command (not pip3, python -m pip, etc) */
function isPipCommand(command: string): boolean {
  const pipPattern = /^(pip|pip3)\s/i;
  return pipPattern.test(command.trim());
}

/** Check if command is info-only (safe to skip) */
function isInfoCommand(command: string): boolean {
  const infoPattern = /\s+(--version|--help|list|freeze)\s*$/i;
  return infoPattern.test(command.trim());
}
