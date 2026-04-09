/**
 * Config loader for pi-sanity
 * Loads and merges TOML config files from multiple sources
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parse } from "smol-toml";
import type {
  Action,
  CommandConfig,
  FlagConfig,
  OverrideRule,
  PermissionSection,
  PreCheck,
  PositionalConfig,
  SanityConfig,
} from "./config-types.ts";
import { createEmptyConfig } from "./config-types.ts";

/**
 * Load and merge all config files from the hierarchy:
 * 1. Built-in defaults (extension dir)
 * 2. User global config (~/.config/pi/sanity.toml)
 * 3. Project config (.pi-sanity.toml)
 *
 * @param extensionDir - Path to extension directory (for built-in defaults)
 * @param projectDir - Path to project root (for project config)
 * @returns Merged SanityConfig
 */
export function loadConfig(
  extensionDir: string,
  projectDir?: string,
): SanityConfig {
  const configs: Partial<SanityConfig>[] = [];

  // 1. Built-in defaults
  const defaultPath = path.join(extensionDir, "default-config.toml");
  if (fs.existsSync(defaultPath)) {
    configs.push(loadTomlFile(defaultPath));
  }

  // 2. User global config
  const userConfigPath = path.join(
    os.homedir(),
    ".config",
    "pi",
    "sanity.toml",
  );
  if (fs.existsSync(userConfigPath)) {
    configs.push(loadTomlFile(userConfigPath));
  }

  // 3. Project config
  if (projectDir) {
    const projectConfigPath = path.join(projectDir, ".pi-sanity.toml");
    if (fs.existsSync(projectConfigPath)) {
      configs.push(loadTomlFile(projectConfigPath));
    }
  }

  // Merge all configs
  return mergeConfigs(configs);
}

/**
 * Parse a single TOML config file
 */
function loadTomlFile(filePath: string): Partial<SanityConfig> {
  const content = fs.readFileSync(filePath, "utf-8");
  return parse(content) as Partial<SanityConfig>;
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
  return {
    default: source.default ?? target.default,
    reason: source.reason ?? target.reason,
    overrides: [...target.overrides, ...(source.overrides ?? [])],
  };
}

/**
 * Merge command configs
 * - default_action/reason: override
 * - aliases: append arrays
 * - pre_checks: append arrays
 * - positionals: deep merge
 * - options: override (later wins)
 * - flags: deep merge (per flag, later wins)
 */
function mergeCommandConfig(
  target: CommandConfig | undefined,
  source: CommandConfig,
): CommandConfig {
  const base = target ?? {
    default_action: source.default_action,
    overrides: [],
  };

  return {
    default_action: source.default_action ?? base.default_action,
    reason: source.reason ?? base.reason,
    aliases: [...(base.aliases ?? []), ...(source.aliases ?? [])],
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
 * Get action for a path against permission rules
 * Returns strictest matching action
 */
export function getPathAction(
  resolvedPath: string,
  permission: PermissionSection,
): { action: Action; reason?: string } {
  // Check overrides in order (last match wins)
  let result: { action: Action; reason?: string } = {
    action: permission.default,
    reason: permission.reason,
  };

  for (const override of permission.overrides) {
    if (matchesGlobAny(resolvedPath, override.path)) {
      result = {
        action: override.action,
        reason: override.reason,
      };
    }
  }

  return result;
}

/**
 * Get command config, falling back to global default "_" if not found
 */
export function getCommandConfig(
  config: SanityConfig,
  commandName: string,
): CommandConfig | undefined {
  // Check for exact match
  if (config.commands[commandName]) {
    return config.commands[commandName];
  }

  // Check aliases
  for (const [name, cmdConfig] of Object.entries(config.commands)) {
    if (cmdConfig.aliases?.includes(commandName)) {
      return cmdConfig;
    }
  }

  // Fall back to global default
  return config.commands["_"];
}

/**
 * Check if a path matches any of the glob patterns
 */
function matchesGlobAny(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Use Node.js path.matchesGlob if available (Node 22+)
    // @ts-ignore - matchesGlob is available in Node 22+
    if (typeof pathModule.matchesGlob === "function") {
      // @ts-ignore
      if (pathModule.matchesGlob(path, pattern)) {
        return true;
      }
    } else {
      // Fallback: simple glob matching
      if (simpleGlobMatch(path, pattern)) {
        return true;
      }
    }
  }
  return false;
}

// Fallback glob implementation
import * as pathModule from "path";

function simpleGlobMatch(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // * = any chars except /
  // ** = any chars including /
  // ? = single char

  let regexStr = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      regexStr += ".*";
      i += 2;
    } else if (c === "*") {
      regexStr += "[^/]*";
      i++;
    } else if (c === "?") {
      regexStr += ".";
      i++;
    } else if (c === ".") {
      regexStr += "\\.";
      i++;
    } else if (c === "/") {
      regexStr += "[/\\\\]"; // Match both forward and backslash
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }
  regexStr += "$";

  const regex = new RegExp(regexStr);
  return regex.test(filePath);
}
