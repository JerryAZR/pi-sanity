/**
 * Config loader for pi-sanity
 * Loads and merges TOML config files from multiple sources
 *
 * Design: Merge at raw TOML level, then build runtime config once.
 * No runtime merging of SanityConfig objects.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parse } from "smol-toml";
import type {
  Rule,
  RuleConfig,
  SanityConfig,
} from "./config-types.js";
import { DEFAULT_CONFIG_CONTENT } from "./generated/default-config.js";
import {
  preprocessConfigPattern,
  type PathContext,
} from "./path-utils.js";

/** Sink for non-fatal config warnings. Falls back to console.warn if not provided. */
export type WarningSink = (msg: string) => void;

function defaultSink(msg: string): void {
  console.warn(msg);
}

function createConfigContext(): PathContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    repo: undefined,
  };
}

function preprocessConfigPatterns(config: SanityConfig, onWarning?: WarningSink): void {
  const sink = onWarning ?? defaultSink;
  const ctx = createConfigContext();

  config.permissions.read.overrides = filterValidOverrides(
    config.permissions.read.overrides, "read", ctx, sink,
  );
  config.permissions.write.overrides = filterValidOverrides(
    config.permissions.write.overrides, "write", ctx, sink,
  );
}

function filterValidOverrides(
  overrides: any[],
  sectionName: string,
  ctx: PathContext,
  sink: WarningSink,
): import("./config-types.js").OverrideRule[] {
  const valid: import("./config-types.js").OverrideRule[] = [];

  for (let i = 0; i < overrides.length; i++) {
    const o = overrides[i];
    if (!o || typeof o !== "object") {
      sink(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: not an object`);
      continue;
    }
    if (!Array.isArray(o.path)) {
      sink(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: missing or invalid 'path' (expected array)`);
      continue;
    }
    if (!["allow", "ask", "deny"].includes(o.action)) {
      sink(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: missing or invalid 'action' (got: ${o.action})`);
      continue;
    }

    valid.push({
      path: o.path.map((p: any) => typeof p === "string" ? preprocessConfigPattern(p, ctx) : "").filter(Boolean),
      action: o.action,
      reason: typeof o.reason === "string" ? o.reason : undefined,
    });
  }

  return valid;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw config representation (before building SanityConfig)
// ─────────────────────────────────────────────────────────────────────────────

interface RawPermissionSection {
  default?: string;
  reason?: string;
  overrides: any[];
}

interface RawCommands {
  default?: string;
  default_action?: string;
  reason?: string;
  rules: any[];
}

interface RawConfig {
  permissions: {
    read: RawPermissionSection;
    write: RawPermissionSection;
  };
  commands: RawCommands;
  ask_timeout?: number;
}

function emptyRawConfig(): RawConfig {
  return {
    permissions: {
      read: { overrides: [] },
      write: { overrides: [] },
    },
    commands: { rules: [] },
  };
}

function parseRawConfig(tomlContent: string): RawConfig {
  const parsed = parse(tomlContent) as any;
  return {
    permissions: {
      read: {
        default: parsed.permissions?.read?.default,
        reason: parsed.permissions?.read?.reason,
        overrides: parsed.permissions?.read?.overrides ?? [],
      },
      write: {
        default: parsed.permissions?.write?.default,
        reason: parsed.permissions?.write?.reason,
        overrides: parsed.permissions?.write?.overrides ?? [],
      },
    },
    commands: {
      ...(parsed.commands ?? {}),
      rules: parsed.commands?.rules ?? [],
    },
    ask_timeout: parsed.ask_timeout,
  };
}

function mergeRawConfigs(base: RawConfig, override: RawConfig): RawConfig {
  return {
    permissions: {
      read: {
        default: override.permissions.read.default ?? base.permissions.read.default,
        reason: override.permissions.read.reason ?? base.permissions.read.reason,
        overrides: [...base.permissions.read.overrides, ...override.permissions.read.overrides],
      },
      write: {
        default: override.permissions.write.default ?? base.permissions.write.default,
        reason: override.permissions.write.reason ?? base.permissions.write.reason,
        overrides: [...base.permissions.write.overrides, ...override.permissions.write.overrides],
      },
    },
    commands: {
      default: override.commands.default ?? override.commands.default_action
        ?? base.commands.default ?? base.commands.default_action,
      reason: override.commands.reason ?? base.commands.reason,
      rules: [...base.commands.rules, ...override.commands.rules],
    },
    ask_timeout: override.ask_timeout ?? base.ask_timeout,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime config builder
// ─────────────────────────────────────────────────────────────────────────────

export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigParseError";
  }
}

function buildSanityConfig(raw: RawConfig, onWarning?: WarningSink): SanityConfig {
  // Warn about unknown keys in [commands] (e.g. old format [commands.NAME])
  const sink = onWarning ?? defaultSink;
  for (const key of Object.keys(raw.commands)) {
    if (!["default", "default_action", "reason", "rules"].includes(key)) {
      sink(
        `[pi-sanity] Ignoring unsupported key "${key}" in [commands]. ` +
        `If you meant to define a command rule, use [[commands.rules]] with names = ["${key}"]. ` +
        `Use /skill:sanity-config for assistance.`
      );
    }
  }

  // Parse commands.rules backwards.
  // Later rules in the source array win over earlier ones.
  // A catch-all (names = [""]) discards all rules that came before it
  // and may change the default action for rules after it.
  const rules: Rule[] = [];
  let catchAllSeen = false;
  let defaultAction = (raw.commands.default ?? "allow") as any;
  let reason = raw.commands.reason;

  for (let i = raw.commands.rules.length - 1; i >= 0; i--) {
    const rawRule = raw.commands.rules[i];
    if (!rawRule || !Array.isArray(rawRule.names) || rawRule.names.length === 0) {
      continue;
    }

    // Reject mixed names arrays containing "" — user almost certainly made a mistake.
    // Only exact names = [""] is valid catch-all syntax.
    if (rawRule.names.includes("")) {
      if (rawRule.names.length > 1) {
        (onWarning ?? defaultSink)(
          `[pi-sanity] Skipping invalid rule #${i}: "" must be the only element in names. ` +
          `Use separate [[commands.rules]] entries for catch-all and named rules.`
        );
      } else {
        // Exact names = [""] → catch-all
        catchAllSeen = true;
        if (rawRule.action !== undefined) {
          defaultAction = rawRule.action as any;
        }
        if (rawRule.reason !== undefined) {
          reason = rawRule.reason;
        }
      }
      continue;
    }

    // Rules before the catch-all are discarded
    if (catchAllSeen) {
      continue;
    }

    const ruleConfig: RuleConfig = {
      reason: rawRule.reason,
      pre_checks: rawRule.pre_checks,
      positionals: rawRule.positionals,
      options: rawRule.options,
      flags: rawRule.flags,
    };

    for (const name of rawRule.names) {
      rules.push({
        name,
        action: (rawRule.action ?? defaultAction) as any,
        reason: rawRule.reason,
        config: ruleConfig,
      });
    }
  }

  // Rules are already in check order: later source rules first
  // (backwards parsing pushes later rules first, then earlier rules)

  const config: SanityConfig = {
    permissions: {
      read: {
        default: (raw.permissions.read.default ?? "allow") as any,
        reason: raw.permissions.read.reason,
        overrides: raw.permissions.read.overrides,
      },
      write: {
        default: (raw.permissions.write.default ?? "allow") as any,
        reason: raw.permissions.write.reason,
        overrides: raw.permissions.write.overrides,
      },
    },
    commands: {
      default_action: defaultAction,
      reason,
      rules,
    },
    ask_timeout: raw.ask_timeout,
  };

  preprocessConfigPatterns(config, onWarning);
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function loadConfigFromString(tomlContent: string, onWarning?: WarningSink): SanityConfig {
  const raw = parseRawConfig(tomlContent);
  return buildSanityConfig(raw, onWarning);
}

export function loadDefaultConfig(onWarning?: WarningSink): SanityConfig {
  const raw = parseRawConfig(DEFAULT_CONFIG_CONTENT);
  return buildSanityConfig(raw, onWarning);
}

export function loadConfig(projectDir?: string, onWarning?: WarningSink): SanityConfig {
  const sink = onWarning ?? defaultSink;

  // 1. Built-in defaults
  let raw = parseRawConfig(DEFAULT_CONFIG_CONTENT);

  // 2. User global config
  const userConfigPath = path.join(os.homedir(), ".pi", "agent", "sanity.toml");
  if (fs.existsSync(userConfigPath)) {
    try {
      const userRaw = parseRawConfig(fs.readFileSync(userConfigPath, "utf-8"));
      raw = mergeRawConfigs(raw, userRaw);
    } catch (e: any) {
      sink(`[pi-sanity] Failed to load config from ${userConfigPath}: ${e.message}`);
    }
  }

  // 3. Project config
  if (projectDir) {
    const projectConfigPath = path.join(projectDir, ".pi", "sanity.toml");
    if (fs.existsSync(projectConfigPath)) {
      try {
        const projectRaw = parseRawConfig(fs.readFileSync(projectConfigPath, "utf-8"));
        raw = mergeRawConfigs(raw, projectRaw);
      } catch (e: any) {
        sink(`[pi-sanity] Failed to load config from ${projectConfigPath}: ${e.message}`);
      }
    }
  }

  return buildSanityConfig(raw, sink);
}
