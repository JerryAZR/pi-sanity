import { describe, it } from "node:test";
import assert from "node:assert";
import {
  loadConfigFromString,
  ConfigParseError,
} from "../../../src/config-loader.js";

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

  it("should order rules so later rules win (last-match-wins)", () => {
    const toml = `
[[commands.rules]]
names = ["cp"]
action = "allow"

[[commands.rules]]
names = ["cp"]
action = "deny"
`;
    const config = loadConfigFromString(toml);

    // Both rules exist, but the later one is checked first
    assert.strictEqual(config.commands.rules.length, 2);
    assert.strictEqual(config.commands.rules[0].name, "cp");
    assert.strictEqual(config.commands.rules[0].action, "deny"); // later source rule = checked first
    assert.strictEqual(config.commands.rules[1].name, "cp");
    assert.strictEqual(config.commands.rules[1].action, "allow");
  });

  it("should handle names = [''] as catch-all clearing earlier rules", () => {
    const toml = `
[commands]
default = "allow"

[[commands.rules]]
names = ["cp"]
action = "ask"

[[commands.rules]]
names = [""]

[[commands.rules]]
names = ["git"]
action = "deny"
`;
    const config = loadConfigFromString(toml);

    // Catch-all discards cp; git survives because it comes after
    assert.strictEqual(config.commands.rules.length, 1);
    assert.strictEqual(config.commands.rules[0].name, "git");
    assert.strictEqual(config.commands.rules[0].action, "deny");
    assert.strictEqual(config.commands.default_action, "allow");
  });

  it("should handle catch-all with action changing default", () => {
    const toml = `
[commands]
default = "allow"

[[commands.rules]]
names = ["cp"]
action = "ask"

[[commands.rules]]
names = [""]
action = "deny"

[[commands.rules]]
names = ["git"]
action = "ask"
`;
    const config = loadConfigFromString(toml);

    // Catch-all discards cp, sets default to deny
    // git survives (after catch-all)
    assert.strictEqual(config.commands.rules.length, 1);
    assert.strictEqual(config.commands.rules[0].name, "git");
    assert.strictEqual(config.commands.rules[0].action, "ask");
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
