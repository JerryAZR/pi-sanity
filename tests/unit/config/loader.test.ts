import { describe, it } from "node:test";
import assert from "node:assert";
import {
  loadConfigFromString,
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

  it("should warn and skip mixed names containing empty string", () => {
    const toml = `
[commands]
default = "allow"

[[commands.rules]]
names = ["cmd1", "cmd2"]
action = "ask"

[[commands.rules]]
names = ["cmd1", "cmd2", "", "cmd3", "cmd4"]
action = "deny"

[[commands.rules]]
names = ["cmd5"]
action = "ask"
`;
    const warnings: string[] = [];
    const config = loadConfigFromString(toml, (msg) => warnings.push(msg));

    // Mixed names entry is skipped — no catch-all, no rules created from it
    // cmd1/cmd2 from first entry survive, cmd5 from last entry survives
    assert.strictEqual(config.commands.rules.length, 3);
    assert.ok(config.commands.rules.some((r) => r.name === "cmd1"));
    assert.ok(config.commands.rules.some((r) => r.name === "cmd2"));
    assert.ok(config.commands.rules.some((r) => r.name === "cmd5"));
    assert.strictEqual(config.commands.default_action, "allow");

    // Warning emitted
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('Skipping invalid rule'));
    assert.ok(warnings[0].includes('must be the only element'));
  });

  it("should warn about old [commands.NAME] format and skip it", () => {
    const toml = `
[commands.cp]
default_action = "allow"
`;
    const warnings: string[] = [];
    const config = loadConfigFromString(toml, (msg) => warnings.push(msg));

    // Old-format entry is ignored; config loads with defaults
    assert.strictEqual(config.commands.rules.length, 0);
    assert.strictEqual(config.commands.default_action, "allow");

    // Warning emitted
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('Ignoring unsupported key "cp"'));
    assert.ok(warnings[0].includes('/skill:sanity-config'));
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
