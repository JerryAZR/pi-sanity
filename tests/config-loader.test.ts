import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mergeConfigs,
  getPathAction,
  getCommandConfig,
  loadConfig,
} from "../src/config-loader.js";
import { createEmptyConfig } from "../src/config-types.js";
import type { SanityConfig, CommandConfig } from "../src/config-types.js";

describe("config-loader", () => {
  describe("mergeConfigs", () => {
    it("should start with empty config defaults", () => {
      const config = createEmptyConfig();
      assert.strictEqual(config.permissions.read.default, "allow");
      assert.strictEqual(config.permissions.write.default, "allow");
      assert.strictEqual(config.permissions.delete.default, "allow");
      assert.strictEqual(config.commands["_"].default_action, "allow");
    });

    it("should merge permission defaults", () => {
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

    it("should append override arrays", () => {
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

    it("should merge command configs", () => {
      const base = createEmptyConfig();
      base.commands["cp"] = {
        default_action: "allow",
        aliases: ["copy"],
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
      assert.deepStrictEqual(cp.aliases, ["copy"]); // Preserved from base
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
  });

  describe("getPathAction", () => {
    it("should return default action when no overrides match", () => {
      const config = createEmptyConfig();
      config.permissions.read.default = "ask";
      config.permissions.read.reason = "Default reason";

      const result = getPathAction("/some/path", config.permissions.read);
      assert.strictEqual(result.action, "ask");
      assert.strictEqual(result.reason, "Default reason");
    });

    it("should return matching override action", () => {
      const config = createEmptyConfig();
      config.permissions.read.overrides.push({
        path: ["/secret/**"],
        action: "deny",
        reason: "Secret files",
      });

      const result = getPathAction("/secret/file.txt", config.permissions.read);
      assert.strictEqual(result.action, "deny");
      assert.strictEqual(result.reason, "Secret files");
    });

    it("should use last matching override (last wins)", () => {
      const config = createEmptyConfig();
      config.permissions.read.overrides.push({
        path: ["/**"],
        action: "deny",
      });
      config.permissions.read.overrides.push({
        path: ["/public/**"],
        action: "allow",
      });

      const result = getPathAction("/public/file.txt", config.permissions.read);
      assert.strictEqual(result.action, "allow");
    });

    it("should support multiple patterns in single override", () => {
      const config = createEmptyConfig();
      config.permissions.read.overrides.push({
        path: ["/a/**", "/b/**"],
        action: "deny",
      });

      assert.strictEqual(getPathAction("/a/file", config.permissions.read).action, "deny");
      assert.strictEqual(getPathAction("/b/file", config.permissions.read).action, "deny");
      assert.strictEqual(getPathAction("/c/file", config.permissions.read).action, "allow");
    });
  });

  describe("getCommandConfig", () => {
    it("should return exact match", () => {
      const config = createEmptyConfig();
      config.commands["cp"] = { default_action: "ask" };

      const result = getCommandConfig(config, "cp");
      assert.strictEqual(result?.default_action, "ask");
    });

    it("should match by alias", () => {
      const config = createEmptyConfig();
      config.commands["cp"] = {
        default_action: "ask",
        aliases: ["copy"],
      };

      const result = getCommandConfig(config, "copy");
      assert.strictEqual(result?.default_action, "ask");
    });

    it("should fall back to global default (_)", () => {
      const config = createEmptyConfig();
      config.commands["_"] = { default_action: "deny", reason: "Unknown" };

      const result = getCommandConfig(config, "unknown-command");
      assert.strictEqual(result?.default_action, "deny");
      assert.strictEqual(result?.reason, "Unknown");
    });

    it("should prefer exact match over alias", () => {
      const config = createEmptyConfig();
      config.commands["mv"] = { default_action: "ask" };
      config.commands["cp"] = {
        default_action: "allow",
        aliases: ["mv"], // edge case: mv is an alias of cp
      };

      const result = getCommandConfig(config, "mv");
      assert.strictEqual(result?.default_action, "ask");
    });
  });
});
