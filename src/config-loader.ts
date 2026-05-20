/**
 * Config loader for pi-sanity
 * Loads and merges TOML config files from multiple sources
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parse } from "smol-toml";
import type {
  CommandConfig,
  FlagConfig,
  PermissionSection,
  PositionalConfig,
  Rule,
  RuleConfig,
  SanityConfig,
} from "./config-types.js";
import { createEmptyConfig } from "./config-types.js";
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

/**
 * Create a PathContext for config preprocessing
 */
function createConfigContext(): PathContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    repo: undefined,
  };
}

/**
 * Preprocess all path patterns in a config.
 */
function preprocessConfigPatterns(config: SanityConfig, onWarning?: WarningSink): void {
  const sink = onWarning ?? defaultSink;
  const ctx = createConfigContext();

  config.permissions.read.overrides = filterValidOverrides(config.permissions.read.overrides, "read", ctx, sink);
  config.permissions.write.overrides = filterValidOverrides(config.permissions.write.overrides, "write", ctx, sink);
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

/**
 * Parse TOML commands section into CommandsConfig.
 * Handles [[commands.rules]] array format.
 */
function parseCommands(tomlCommands: any): { default_action: string; reason?: string; rules: Rule[] } {
  const result = {
    default_action: tomlCommands?.default ?? tomlCommands?.default_action ?? "allow",
    reason: tomlCommands?.reason,
    rules: [] as Rule[],
  };

  // Detect old format [commands.NAME]
  const knownKeys = new Set(["default", "default_action", "reason", "rules"]);
  for (const key of Object.keys(tomlCommands ?? {})) {
    if (!knownKeys.has(key)) {
      throw new ConfigParseError(
        `Config uses old command rule format: [commands.${key}]. ` +
        `Please migrate to the new [[commands.rules]] format. ` +
        `Use /skill:sanity-config for assistance.`
      );
    }
  }

  const rawRules = tomlCommands?.rules;
  if (!Array.isArray(rawRules)) return result;

  for (let i = 0; i < rawRules.length; i++) {
    const raw = rawRules[i];
    if (!raw || !Array.isArray(raw.names) || raw.names.length === 0) continue;

    // Catch-all: names = [""]
    if (raw.names.length === 1 && raw.names[0] === "") {
      result.rules = []; // clear all previous rules
      result.default_action = raw.action ?? result.default_action;
      result.reason = raw.reason ?? result.reason;
      continue;
    }

    const ruleConfig: RuleConfig = {
      reason: raw.reason,
      pre_checks: raw.pre_checks,
      positionals: raw.positionals,
      options: raw.options,
      flags: raw.flags,
    };

    // Flatten names: one rule per name, sharing the same config
    for (const name of raw.names) {
      result.rules.push({
        name,
        priority: i,
        action: raw.action ?? result.default_action,
        reason: raw.reason,
        config: ruleConfig,
      });
    }
  }

  return result;
}

export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigParseError";
  }
}

/**
 * Load a TOML config from a string.
 */
export function loadConfigFromString(tomlContent: string, onWarning?: WarningSink): SanityConfig {
  const parsed = parse(tomlContent) as any;
  const commands = parseCommands(parsed.commands);

  const config: SanityConfig = {
    permissions: {
      read: mergePermissionSection(
        { default: "allow", overrides: [] },
        parsed.permissions?.read ?? {},
      ),
      write: mergePermissionSection(
        { default: "allow", overrides: [] },
        parsed.permissions?.write ?? {},
      ),
    },
    commands: {
      default_action: commands.default_action as any,
      reason: commands.reason,
      rules: commands.rules,
    },
    ask_timeout: parsed.ask_timeout,
  };

  preprocessConfigPatterns(config, onWarning);
  return config;
}

/**
 * Load the embedded default config.
 */
function loadEmbeddedDefaultConfig(): any {
  return parse(DEFAULT_CONFIG_CONTENT);
}

/**
 * Load only the built-in default configuration.
 */
export function loadDefaultConfig(onWarning?: WarningSink): SanityConfig {
  const parsed = loadEmbeddedDefaultConfig();
  const commands = parseCommands(parsed.commands);

  const config: SanityConfig = {
    permissions: {
      read: mergePermissionSection(
        { default: "allow", overrides: [] },
        parsed.permissions?.read ?? {},
      ),
      write: mergePermissionSection(
        { default: "allow", overrides: [] },
        parsed.permissions?.write ?? {},
      ),
    },
    commands: {
      default_action: commands.default_action as any,
      reason: commands.reason,
      rules: commands.rules,
    },
    ask_timeout: parsed.ask_timeout,
  };

  preprocessConfigPatterns(config, onWarning);
  return config;
}

/**
 * Load and merge all config files from the hierarchy.
 */
export function loadConfig(projectDir?: string, onWarning?: WarningSink): SanityConfig {
  const sink = onWarning ?? defaultSink;
  const configs: SanityConfig[] = [];

  // 1. Built-in defaults
  configs.push(loadDefaultConfig(sink));

  // 2. User global config
  const userConfigPath = path.join(os.homedir(), ".pi", "agent", "sanity.toml");
  if (fs.existsSync(userConfigPath)) {
    try {
      configs.push(loadConfigFromString(fs.readFileSync(userConfigPath, "utf-8"), sink));
    } catch (e: any) {
      sink(`[pi-sanity] Failed to load config from ${userConfigPath}: ${e.message}`);
    }
  }

  // 3. Project config
  if (projectDir) {
    const projectConfigPath = path.join(projectDir, ".pi", "sanity.toml");
    if (fs.existsSync(projectConfigPath)) {
      try {
        configs.push(loadConfigFromString(fs.readFileSync(projectConfigPath, "utf-8"), sink));
      } catch (e: any) {
        sink(`[pi-sanity] Failed to load config from ${projectConfigPath}: ${e.message}`);
      }
    }
  }

  // Merge all configs
  let result = configs[0];
  for (let i = 1; i < configs.length; i++) {
    result = mergeConfigs(result, configs[i]);
  }

  return result;
}

/**
 * Merge two SanityConfigs. Base is the lower-priority config, override is higher-priority.
 */
export function mergeConfigs(base: SanityConfig, override: SanityConfig): SanityConfig {
  const result: SanityConfig = {
    permissions: {
      read: mergePermissionSection(base.permissions.read, override.permissions.read),
      write: mergePermissionSection(base.permissions.write, override.permissions.write),
    },
    commands: {
      default_action: override.commands.default_action ?? base.commands.default_action,
      reason: override.commands.reason ?? base.commands.reason,
      rules: [],
    },
    ask_timeout: override.ask_timeout ?? base.ask_timeout,
  };

  // Offset override priorities so they always win over base
  const offset = base.commands.rules.length;
  for (const rule of base.commands.rules) {
    result.commands.rules.push(rule);
  }
  for (const rule of override.commands.rules) {
    result.commands.rules.push({ ...rule, priority: rule.priority + offset });
  }

  // Sort descending by priority (highest first = last-match-wins)
  result.commands.rules.sort((a, b) => b.priority - a.priority);

  return result;
}

/**
 * Merge permission sections.
 */
function mergePermissionSection(
  target: PermissionSection,
  source: Partial<PermissionSection>,
): PermissionSection {
  const sourceOverrides = Array.isArray(source.overrides)
    ? source.overrides
    : [];
  return {
    default: source.default ?? target.default,
    reason: source.reason ?? target.reason,
    overrides: [...target.overrides, ...sourceOverrides],
  };
}
