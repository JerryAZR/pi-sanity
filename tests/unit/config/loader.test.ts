import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mergeConfigs,
  loadConfigFromString,
  ConfigParseError,
} from "../../../src/config-loader.js";
import { createEmptyConfig } from "../../../src/config-types.js";
import type { SanityConfig } from "../../../src/config-types.js";

describe("mergeConfigs", () => {
  it("should use later config for permission defaults", () => {
    const base = createEmptyConfig();
    const override = createEmptyConfig();
    override.permissions.read.default = "ask";
    override.permissions.write.default = "deny";

    const merged = mergeConfigs(base, override);

    assert.strictEqual(merged.permissions.read.default, "ask");
    assert.strictEqual(merged.permissions.write.default, "deny");
  });

  it("should append override arrays (not replace)", () => {
    const base = createEmptyConfig();
    base.permissions.read.overrides.push({
      path: ["/base/**"],
      action: "ask",
    });

    const override = createEmptyConfig();
    override.permissions.read.overrides.push({
      path: ["/override/**"],
      action: "deny",
    });

    const merged = mergeConfigs(base, override);

    assert.strictEqual(merged.permissions.read.overrides.length, 2);
    assert.deepStrictEqual(merged.permissions.read.overrides[0].path, ["/base/**"]);
    assert.deepStrictEqual(merged.permissions.read.overrides[1].path, ["/override/**"]);
  });

  it("should merge command rules with priority offset (override wins)", () => {
    const base = createEmptyConfig();
    base.commands.rules.push(
      { name: "cp", priority: 0, action: "allow", config: {} },
      { name: "mv", priority: 1, action: "ask", config: {} },
    );

    const override = createEmptyConfig();
    override.commands.rules.push(
      { name: "cp", priority: 0, action: "deny", config: {} },
    );

    const merged = mergeConfigs(base, override);

    // Override cp has higher priority (0 + 2 = 2) than base cp (0)
    const cpRule = merged.commands.rules.find(r => r.name === "cp" && r.priority === 2);
    assert.ok(cpRule);
    assert.strictEqual(cpRule.action, "deny");

    // mv still present
    assert.ok(merged.commands.rules.some(r => r.name === "mv"));
  });

  it("should override ask_timeout", () => {
    const base = createEmptyConfig();
    base.ask_timeout = 30;

    const override = createEmptyConfig();
    override.ask_timeout = 60;

    const merged = mergeConfigs(base, override);
    assert.strictEqual(merged.ask_timeout, 60);
  });

  it("should not override ask_timeout when later config omits it", () => {
    const base = createEmptyConfig();
    base.ask_timeout = 45;

    const override = createEmptyConfig();
    // ask_timeout omitted

    const merged = mergeConfigs(base, override);
    assert.strictEqual(merged.ask_timeout, 45);
  });

  it("should sort rules by priority descending after merge", () => {
    const base = createEmptyConfig();
    base.commands.rules.push(
      { name: "git", priority: 0, action: "allow", config: {} },
    );

    const override = createEmptyConfig();
    override.commands.rules.push(
      { name: "npm", priority: 0, action: "deny", config: {} },
    );

    const merged = mergeConfigs(base, override);

    // npm has priority 0 + 1 = 1, git has priority 0
    // Sorted descending: npm first, then git
    assert.strictEqual(merged.commands.rules[0].name, "npm");
    assert.strictEqual(merged.commands.rules[1].name, "git");
  });
});

describe("loadConfigFromString", () => {
  it("should parse [[commands.rules]] array", () => {
    const toml = `
[commands]
default = "allow"

[[commands.rules]]
names = ["cp", "mv"]
action = "ask"

[[commands.rules]]
names = ["rm"]
action = "deny"
`;
    const config = loadConfigFromString(toml);

    assert.strictEqual(config.commands.default_action, "allow");
    assert.strictEqual(config.commands.rules.length, 3); // cp, mv, rm
    assert.ok(config.commands.rules.some(r => r.name === "cp" && r.action === "ask"));
    assert.ok(config.commands.rules.some(r => r.name === "mv" && r.action === "ask"));
    assert.ok(config.commands.rules.some(r => r.name === "rm" && r.action === "deny"));
  });

  it("should flatten names into separate rules", () => {
    const toml = `
[[commands.rules]]
names = ["npm", "pnpm"]
flags = [{ flag = "-g", action = "deny" }]
`;
    const config = loadConfigFromString(toml);

    assert.strictEqual(config.commands.rules.length, 2);
    assert.ok(config.commands.rules.some(r => r.name === "npm"));
    assert.ok(config.commands.rules.some(r => r.name === "pnpm"));
  });

  it("should handle names = [''] as catch-all clearing rules", () => {
    const toml = `
[commands]
default = "allow"

[[commands.rules]]
names = ["cp"]
action = "ask"

[[commands.rules]]
names = [""]
action = "deny"
`;
    const config = loadConfigFromString(toml);

    // Catch-all clears all previous rules
    assert.strictEqual(config.commands.rules.length, 0);
    assert.strictEqual(config.commands.default_action, "deny");
  });

  it("should throw ConfigParseError for old [commands.NAME] format", () => {
    const toml = `
[commands.cp]
default_action = "allow"
`;
    assert.throws(
      () => loadConfigFromString(toml),
      (err: any) => {
        assert.ok(err instanceof ConfigParseError);
        assert.ok(err.message.includes("old command rule format"));
        assert.ok(err.message.includes("/skill:sanity-config"));
        return true;
      },
    );
  });

  it("should parse permissions", () => {
    const toml = `
[permissions.read]
default = "deny"

[[permissions.read.overrides]]
path = ["/safe/**"]
action = "allow"
`;
    const config = loadConfigFromString(toml);

    assert.strictEqual(config.permissions.read.default, "deny");
    assert.strictEqual(config.permissions.read.overrides.length, 1);
    assert.deepStrictEqual(config.permissions.read.overrides[0].path, ["/safe/**"]);
    assert.strictEqual(config.permissions.read.overrides[0].action, "allow");
  });

  it("should parse ask_timeout", () => {
    const toml = `ask_timeout = 45`;
    const config = loadConfigFromString(toml);
    assert.strictEqual(config.ask_timeout, 45);
  });
});
