/**
 * Configuration types for pi-sanity
 * All fields use full names for clarity (e.g., "read,delete" not "rd")
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

export interface PreCheck {
  env: string;
  match: string;
  action: Action;
  reason?: string;
}

export interface PositionalConfig {
  default_perm: string; // e.g., "read", "write", "read,delete", or "" for none
  overrides?: Record<string, string>; // index -> permission, e.g., { "-1": "write" }
}

export interface FlagConfig {
  action: Action;
  reason?: string;
}

export interface CommandConfig {
  default_action: Action;
  reason?: string;
  pre_checks?: PreCheck[];
  positionals?: PositionalConfig;
  options?: Record<string, string>; // option name -> permission
  flags?: Record<string, FlagConfig>;
}

export interface PermissionsConfig {
  read: PermissionSection;
  write: PermissionSection;
  delete: PermissionSection;
}

export interface SanityConfig {
  permissions: PermissionsConfig;
  commands: Record<string, CommandConfig>;
}

/**
 * Empty config structure for initialization
 */
export function createEmptyConfig(): SanityConfig {
  return {
    permissions: {
      read: { default: "allow", overrides: [] },
      write: { default: "allow", overrides: [] },
      delete: { default: "allow", overrides: [] },
    },
    commands: {
      // Global default for unknown commands - low friction
      "_": {
        default_action: "allow",
        reason: "Unknown commands default to allow (low-friction)",
      },
    },
  };
}
