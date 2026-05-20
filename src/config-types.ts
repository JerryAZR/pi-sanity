/**
 * Configuration types for pi-sanity
 * All fields use full names for clarity
 */

export type Action = "allow" | "ask" | "deny";

export interface OverrideRule {
  path: string[];
  action: Action;
  reason?: string;
}

export interface PermissionSection {
  default: Action;
  reason?: string;
  overrides: OverrideRule[];
}

/**
 * Environment pre-check (currently the only implemented pre-check type).
 * User-facing config uses "pre_checks" which may support other types in the future.
 */
export interface PreCheck {
  env: string;
  match: string;
  action: Action;
  reason?: string;
}

export interface PositionalConfig {
  default_perm: string[]; // e.g. ["read"], ["read", "write"], or [] for none
  overrides?: Record<string, string[]>; // index -> permission, e.g. { "-1": ["write"] }
}

export interface FlagConfig {
  action: Action;
  reason?: string;
}

/**
 * The body of a command rule: positionals, options, flags, pre_checks.
 * The rule's fallback action lives at Rule.action, not here.
 */
export interface RuleConfig {
  reason?: string;
  pre_checks?: PreCheck[];
  positionals?: PositionalConfig;
  options?: Record<string, string[]>; // option name -> permission
  flags?: Array<{ flag: string } & FlagConfig>;
}

/**
 * Backward-compat alias. `CommandConfig` was the old per-command table value.
 * It maps 1:1 to `RuleConfig` (no default_action field).
 * @deprecated Use RuleConfig directly.
 */
export type CommandConfig = RuleConfig;

/**
 * A single flattened rule with one name and a priority.
 * Created from `[[commands.rules]]` entries at parse time.
 */
export interface Rule {
  name: string;            // single prefix
  priority: number;        // higher = later in config = wins over lower
  action: Action;          // fallback when no checks trigger
  reason?: string;
  config: RuleConfig;
}

/**
 * The commands domain: default action + ordered rule list.
 */
export interface CommandsConfig {
  default_action: Action;
  reason?: string;
  rules: Rule[];
  /** If true, this config was produced from a catch-all (names=[""]) and should discard inherited rules when merged. */
  clear_rules?: boolean;
}

export interface PermissionsConfig {
  read: PermissionSection;
  write: PermissionSection;
}

export interface SanityConfig {
  permissions: PermissionsConfig;
  commands: CommandsConfig;
  ask_timeout?: number; // Timeout in seconds for "ask" prompts (default: 30)
}

/**
 * Empty config structure for initialization
 */
export function createEmptyConfig(): SanityConfig {
  return {
    permissions: {
      read: { default: "allow", overrides: [] },
      write: { default: "allow", overrides: [] },
    },
    commands: {
      default_action: "allow",
      reason: "Unknown commands default to allow (low-friction)",
      rules: [],
    },
  };
}
