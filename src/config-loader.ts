/**
 * Config loader for pi-sanity
 * Loads and merges TOML config files from multiple sources
 * Aliases are expanded into separate CommandConfig entries for O(1) lookup
 * Patterns are preprocessed at load time for efficient matching
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parse } from "smol-toml";
import type {
  Action,
  CommandConfig,
  FlagConfig,
  PermissionSection,
  PositionalConfig,
  SanityConfig,
} from "./config-types.js";
import { createEmptyConfig } from "./config-types.js";
import { DEFAULT_CONFIG_CONTENT } from "./generated/default-config.js";
import {
  preprocessConfigPattern,
  type PathContext,
} from "./path-utils.js";

/**
 * Create a PathContext for config preprocessing
 */
function createConfigContext(): PathContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    tmpdir: os.tmpdir(),
    repo: undefined, // Will be set per-project if needed
  };
}

/**
 * Preprocess all path patterns in a config.
 * Expands variables ({{HOME}}, {{CWD}}, etc.) and normalizes paths.
 * Called after config loading/merging so patterns are ready to use.
 * Skips invalid overrides (missing path or action) with a warning.
 */
function preprocessConfigPatterns(config: SanityConfig): void {
  const ctx = createConfigContext();

  config.permissions.read.overrides = filterValidOverrides(config.permissions.read.overrides, "read", ctx);
  config.permissions.write.overrides = filterValidOverrides(config.permissions.write.overrides, "write", ctx);
  config.permissions.delete.overrides = filterValidOverrides(config.permissions.delete.overrides, "delete", ctx);
}

function filterValidOverrides(
  overrides: any[],
  sectionName: string,
  ctx: PathContext,
): import("./config-types.js").OverrideRule[] {
  const valid: import("./config-types.js").OverrideRule[] = [];

  for (let i = 0; i < overrides.length; i++) {
    const o = overrides[i];
    if (!o || typeof o !== "object") {
      console.warn(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: not an object`);
      continue;
    }
    if (!Array.isArray(o.path)) {
      console.warn(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: missing or invalid 'path' (expected array)`);
      continue;
    }
    if (!["allow", "ask", "deny"].includes(o.action)) {
      console.warn(`[pi-sanity] Skipping invalid override #${i} in [permissions.${sectionName}]: missing or invalid 'action' (got: ${o.action})`);
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
 * Load a TOML config from a string.
 * Use this for inline config in tests or programmatic config.
 * Patterns are NOT preprocessed - caller must preprocess if needed,
 * or use preprocessConfigPatterns() directly.
 */
export function loadConfigFromString(tomlContent: string): SanityConfig {
  const parsed = parse(tomlContent) as Partial<SanityConfig>;
  const config = mergeConfigs([expandAliases(parsed)]);
  preprocessConfigPatterns(config);
  return config;
}

/**
 * Load the embedded default config.
 * This is embedded at build time by scripts/embed-config.js
 */
function loadEmbeddedDefaultConfig(): Partial<SanityConfig> {
  return parse(DEFAULT_CONFIG_CONTENT) as Partial<SanityConfig>;
}

/**
 * Load only the built-in default configuration.
 * Does not load user global or project configs.
 * Useful for testing or when you want guaranteed defaults.
 */
export function loadDefaultConfig(): SanityConfig {
  const config = mergeConfigs([expandAliases(loadEmbeddedDefaultConfig())]);
  preprocessConfigPatterns(config);
  return config;
}

/**
 * Load and merge all config files from the hierarchy:
 * 1. Built-in defaults (embedded at build time)
 * 2. User global config (~/.pi/agent/sanity.toml)
 * 3. Project config (.pi/sanity.toml)
 *
 * @param projectDir - Path to project root (for project config)
 * @returns Merged SanityConfig with preprocessed patterns
 */
export function loadConfig(projectDir?: string): SanityConfig {
  const configs: Partial<SanityConfig>[] = [];

  // 1. Built-in defaults (embedded at build time)
  configs.push(expandAliases(loadEmbeddedDefaultConfig()));

  // 2. User global config (~/.pi/agent/sanity.toml)
  const userConfigPath = path.join(
    os.homedir(),
    ".pi",
    "agent",
    "sanity.toml",
  );
  if (fs.existsSync(userConfigPath)) {
    const userConfig = loadTomlFile(userConfigPath);
    if (userConfig) {
      configs.push(expandAliases(userConfig));
    }
  }

  // 3. Project config (.pi/sanity.toml)
  if (projectDir) {
    const projectConfigPath = path.join(projectDir, ".pi", "sanity.toml");
    if (fs.existsSync(projectConfigPath)) {
      const projectConfig = loadTomlFile(projectConfigPath);
      if (projectConfig) {
        configs.push(expandAliases(projectConfig));
      }
    }
  }

  // Merge all configs
  const config = mergeConfigs(configs);
  
  // Preprocess all patterns after merging
  preprocessConfigPatterns(config);
  
  return config;
}

/**
 * Parse a single TOML config file.
 * Returns undefined and logs a warning on parse error instead of crashing.
 */
function loadTomlFile(filePath: string): Partial<SanityConfig> | undefined {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parse(content) as Partial<SanityConfig>;
  } catch (err: any) {
    const message = err?.message || String(err);
    console.warn(`[pi-sanity] Failed to load config from ${filePath}: ${message}`);
    return undefined;
  }
}

/**
 * Expand aliases in commands so each alias gets its own CommandConfig entry.
 * This allows O(1) lookup and independent override of aliases.
 *
 * Input: { cp: { aliases: ["copy"], default_action: "allow" } }
 * Output: { cp: { default_action: "allow" }, copy: { default_action: "allow" } }
 */
function expandAliases(config: Partial<SanityConfig>): Partial<SanityConfig> {
  if (!config.commands) return config;

  const expandedCommands: Record<string, CommandConfig> = {};

  for (const [name, cmdConfig] of Object.entries(config.commands)) {
    if (!cmdConfig) continue;

    // Get aliases and remove from config
    const aliases = (cmdConfig as CommandConfig & { aliases?: string[] }).aliases;
    const { aliases: _, ...configWithoutAliases } = cmdConfig as CommandConfig & { aliases?: string[] };

    // Add primary command
    expandedCommands[name] = configWithoutAliases;

    // Expand each alias as a copy
    if (aliases) {
      for (const alias of aliases) {
        // Alias gets a copy - can diverge independently
        expandedCommands[alias] = { ...configWithoutAliases };
      }
    }
  }

  return {
    ...config,
    commands: expandedCommands,
  };
}

/**
 * Merge multiple partial configs into a single SanityConfig
 *
 * Merge semantics:
 * - Objects: deep merge (recurse)
 * - Arrays: append (later configs add items after earlier)
 * - Scalars: later overrides earlier
 */
export function mergeConfigs(
  configs: Partial<SanityConfig>[],
): SanityConfig {
  const result = createEmptyConfig();

  for (const config of configs) {
    if (!config) continue;
    mergeInto(result, config);
  }

  return result;
}

/**
 * Merge a partial config into the result (mutates result)
 */
function mergeInto(target: SanityConfig, source: Partial<SanityConfig>): void {
  // Merge permissions
  if (source.permissions) {
    if (source.permissions.read) {
      target.permissions.read = mergePermissionSection(
        target.permissions.read,
        source.permissions.read,
      );
    }
    if (source.permissions.write) {
      target.permissions.write = mergePermissionSection(
        target.permissions.write,
        source.permissions.write,
      );
    }
    if (source.permissions.delete) {
      target.permissions.delete = mergePermissionSection(
        target.permissions.delete,
        source.permissions.delete,
      );
    }
  }

  // Merge ask_timeout (later overrides earlier)
  if (source.ask_timeout !== undefined) {
    target.ask_timeout = source.ask_timeout;
  }

  // Merge commands (deep merge per command)
  if (source.commands) {
    for (const [name, cmdConfig] of Object.entries(source.commands)) {
      if (cmdConfig) {
        target.commands[name] = mergeCommandConfig(
          target.commands[name],
          cmdConfig,
        );
      }
    }
  }
}

/**
 * Merge permission sections
 * - default/reason: override
 * - overrides: append arrays
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

/**
 * Merge command configs
 * - default_action/reason: override
 * - pre_checks: append arrays
 * - positionals: deep merge
 * - options: override (later wins)
 * - flags: deep merge (per flag, later wins)
 */
function mergeCommandConfig(
  target: CommandConfig | undefined,
  source: CommandConfig,
): CommandConfig {
  const base: CommandConfig = target ?? {
    default_action: source.default_action,
  };

  return {
    default_action: source.default_action ?? base.default_action,
    reason: source.reason ?? base.reason,
    pre_checks: [...(base.pre_checks ?? []), ...(source.pre_checks ?? [])],
    positionals: mergePositionals(base.positionals, source.positionals),
    options: { ...base.options, ...source.options },
    flags: mergeFlags(base.flags, source.flags),
  };
}

/**
 * Merge positional configs
 */
function mergePositionals(
  target: PositionalConfig | undefined,
  source: PositionalConfig | undefined,
): PositionalConfig | undefined {
  if (!source) return target;
  if (!target) return source;

  return {
    default_perm: source.default_perm ?? target.default_perm,
    overrides: { ...target.overrides, ...source.overrides },
  };
}

/**
 * Merge flag configs
 */
function mergeFlags(
  target: Record<string, FlagConfig> | undefined,
  source: Record<string, FlagConfig> | undefined,
): Record<string, FlagConfig> | undefined {
  if (!source) return target;
  if (!target) return source;

  return { ...target, ...source };
}

/**
 * Get command config, falling back to global default "_" if not found
 * O(1) lookup since aliases are expanded into separate entries
 */
export function getCommandConfig(
  config: SanityConfig,
  commandName: string,
): CommandConfig | undefined {
  return config.commands[commandName] ?? config.commands["_"];
}
