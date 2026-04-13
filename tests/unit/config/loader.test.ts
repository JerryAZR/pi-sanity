import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mergeConfigs,
  getCommandConfig,
} from "../../../src/config-loader.js";
import { createEmptyConfig } from "../../../src/config-types.js";
import type { SanityConfig, CommandConfig } from "../../../src/config-types.js";

describe("mergeConfigs", () => {
  it("should use later config for permission defaults", () => {
    const base = createEmptyConfig();
    const override: Partial<SanityConfig> = {
      permissions: {
        read: { default: "ask", overrides: [] },
        write: { default: "deny", overrides: [] },
        delete: { default: "ask", overrides: [] },
      },
    };

    const merged = mergeConfigs([base, override]);

    assert.strictEqual(merged.permissions.read.default, "ask");
    assert.strictEqual(merged.permissions.write.default, "deny");
    assert.strictEqual(merged.permissions.delete.default, "ask");
  });

  it("should append override arrays (not replace)", () => {
    const base = createEmptyConfig();
    base.permissions.read.overrides.push({
      path: ["/base/**"],
      action: "ask",
    });

    const override: Partial<SanityConfig> = {
      permissions: {
        read: {
          default: "allow",
          overrides: [{ path: ["/override/**"], action: "deny" }],
        },
        write: { default: "allow", overrides: [] },
        delete: { default: "allow", overrides: [] },
      },
    };

    const merged = mergeConfigs([base, override]);

    assert.strictEqual(merged.permissions.read.overrides.length, 2);
    assert.deepStrictEqual(merged.permissions.read.overrides[0].path, ["/base/**"]);
    assert.deepStrictEqual(merged.permissions.read.overrides[1].path, ["/override/**"]);
  });

  it("should deep merge command configs", () => {
    const base = createEmptyConfig();
    base.commands["cp"] = {
      default_action: "allow",
      pre_checks: [{ env: "USER", match: "root", action: "deny" }],
    };

    const override: Partial<SanityConfig> = {
      permissions: {
        read: { default: "allow", overrides: [] },
        write: { default: "allow", overrides: [] },
        delete: { default: "allow", overrides: [] },
      },
      commands: {
        cp: {
          default_action: "ask",
          pre_checks: [{ env: "PWD", match: "/tmp", action: "ask" }],
        } as CommandConfig,
      },
    };

    const merged = mergeConfigs([base, override]);
    const cp = merged.commands["cp"];

    assert.strictEqual(cp.default_action, "ask"); // Overridden
    assert.strictEqual(cp.pre_checks?.length, 2); // Both pre-checks
  });

  it("should add new commands from later configs", () => {
    const base = createEmptyConfig();
    const override: Partial<SanityConfig> = {
      permissions: {
        read: { default: "allow", overrides: [] },
        write: { default: "allow", overrides: [] },
        delete: { default: "allow", overrides: [] },
      },
      commands: {
        custom: {
          default_action: "deny",
          reason: "Custom command",
        } as CommandConfig,
      },
    };

    const merged = mergeConfigs([base, override]);

    assert.strictEqual(merged.commands["custom"].default_action, "deny");
  });

  it("should allow aliases to diverge independently after expansion", () => {
    // Simulate pre-expanded configs (aliases already processed)
    const base: Partial<SanityConfig> = {
      permissions: {
        read: { default: "allow", overrides: [] },
        write: { default: "allow", overrides: [] },
        delete: { default: "allow", overrides: [] },
      },
      commands: {
        npm: { default_action: "allow" },
        pnpm: { default_action: "allow" }, // expanded alias
      },
    };

    // Later config overrides just the alias
    const override: Partial<SanityConfig> = {
      permissions: {
        read: { default: "allow", overrides: [] },
        write: { default: "allow", overrides: [] },
        delete: { default: "allow", overrides: [] },
      },
      commands: {
        pnpm: { default_action: "deny", reason: "Custom pnpm rule" },
      },
    };

    const merged = mergeConfigs([base, override]);

    assert.strictEqual(merged.commands["npm"].default_action, "allow"); // Unchanged
    assert.strictEqual(merged.commands["pnpm"].default_action, "deny"); // Overridden
    assert.strictEqual(merged.commands["pnpm"].reason, "Custom pnpm rule");
  });
});

describe("getCommandConfig", () => {
  it("should return exact match", () => {
    const config = createEmptyConfig();
    config.commands["cp"] = { default_action: "ask" };

    const result = getCommandConfig(config, "cp");

    assert.strictEqual(result?.default_action, "ask");
  });

  it("should return O(1) lookup for expanded aliases", () => {
    // Aliases are expanded into separate entries during load
    const config = createEmptyConfig();
    config.commands["cp"] = { default_action: "allow" };
    config.commands["copy"] = { default_action: "allow" }; // expanded alias

    const result = getCommandConfig(config, "copy");

    assert.strictEqual(result?.default_action, "allow");
  });

  it("should fall back to global default (_) if not found", () => {
    const config = createEmptyConfig();
    config.commands["_"] = { default_action: "deny", reason: "Unknown" };

    const result = getCommandConfig(config, "unknown-command");

    assert.strictEqual(result?.default_action, "deny");
    assert.strictEqual(result?.reason, "Unknown");
  });

  it("should allow overriding specific aliases independently", () => {
    const config = createEmptyConfig();
    config.commands["cp"] = { default_action: "allow" };
    config.commands["copy"] = { default_action: "ask", reason: "Prefer cp" };

    const cpResult = getCommandConfig(config, "cp");
    const copyResult = getCommandConfig(config, "copy");

    assert.strictEqual(cpResult?.default_action, "allow");
    assert.strictEqual(copyResult?.default_action, "ask");
    assert.strictEqual(copyResult?.reason, "Prefer cp");
  });
});
