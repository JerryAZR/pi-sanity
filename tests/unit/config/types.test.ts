import { describe, it } from "node:test";
import assert from "node:assert";
import { createEmptyConfig } from "../../../src/config-types.js";

describe("createEmptyConfig", () => {
  it("should create config with allow defaults for all permissions", () => {
    const config = createEmptyConfig();

    assert.strictEqual(config.permissions.read.default, "allow");
    assert.strictEqual(config.permissions.write.default, "allow");
    assert.strictEqual(config.permissions.delete.default, "allow");
  });

  it("should create config with empty overrides arrays", () => {
    const config = createEmptyConfig();

    assert.deepStrictEqual(config.permissions.read.overrides, []);
    assert.deepStrictEqual(config.permissions.write.overrides, []);
    assert.deepStrictEqual(config.permissions.delete.overrides, []);
  });

  it("should create config with global default command", () => {
    const config = createEmptyConfig();

    assert.strictEqual(config.commands["_"].default_action, "allow");
  });

  it("should create independent copies (no shared references)", () => {
    const config1 = createEmptyConfig();
    const config2 = createEmptyConfig();

    // Modify config1
    config1.permissions.read.overrides.push({
      path: ["/test/**"],
      action: "deny",
    });

    // config2 should be unaffected
    assert.strictEqual(config1.permissions.read.overrides.length, 1);
    assert.strictEqual(config2.permissions.read.overrides.length, 0);
  });
});
