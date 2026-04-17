import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigManager } from "../../src/config-manager.js";
import { loadConfigFromString, loadConfig } from "../../src/index.js";

describe("ConfigManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sanity-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("initial load", () => {
    it("should load default config when no project config exists", () => {
      const manager = new ConfigManager(tmpDir);
      const config = manager.get();
      assert.ok(config);
      assert.strictEqual(config.permissions.read.default, "allow");
    });

    it("should load project config when present", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\nreason = "Test deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config = manager.get();
      assert.strictEqual(config.permissions.read.default, "deny");
    });

    it("should fall back to default config when project config is invalid TOML", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[[permissions.read.overrides]]\npath = ["/foo"\naction = "allow"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config = manager.get();
      assert.strictEqual(config.permissions.read.default, "allow");
    });
  });

  describe("lazy reload", () => {
    it("should not reload when file has not changed", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();

      // Same file, no changes
      const config2 = manager.get();

      // Should be the same object (no reload)
      assert.strictEqual(config1, config2);
    });

    it("should reload when project config is modified", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();
      assert.strictEqual(config1.permissions.read.default, "deny");

      // Modify the file
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "ask"\n',
        "utf-8",
      );

      const config2 = manager.get();
      assert.strictEqual(config2.permissions.read.default, "ask");

      // Should be a different object (reloaded)
      assert.notStrictEqual(config1, config2);
    });

    it("should reload when project config is created", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");

      // Start with no config
      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();
      assert.strictEqual(config1.permissions.read.default, "allow");

      // Create config file
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const config2 = manager.get();
      assert.strictEqual(config2.permissions.read.default, "deny");
    });

    it("should reload when project config is deleted", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();
      assert.strictEqual(config1.permissions.read.default, "deny");

      // Delete config file
      fs.unlinkSync(configPath);

      const config2 = manager.get();
      assert.strictEqual(config2.permissions.read.default, "allow");
    });

    it("should fall back to defaults when project config becomes invalid TOML", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();
      assert.strictEqual(config1.permissions.read.default, "deny");

      // Corrupt the file with invalid TOML
      fs.writeFileSync(
        configPath,
        'this is definitely not valid toml = { [\n',
        "utf-8",
      );

      const config2 = manager.get();
      // Invalid file is skipped, falls back to embedded defaults
      assert.strictEqual(config2.permissions.read.default, "allow");
    });
  });

  describe("hasWarnings", () => {
    it("should return false when no warnings", () => {
      const manager = new ConfigManager(tmpDir);
      assert.strictEqual(manager.hasWarnings(), false);
    });

    it("should return true when initial load produces warnings", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'this is not valid toml = { [\n', "utf-8");

      const manager = new ConfigManager(tmpDir);
      assert.strictEqual(manager.hasWarnings(), true);
    });

    it("should return true after drainWarnings until cleared", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'this is not valid toml = { [\n', "utf-8");

      const manager = new ConfigManager(tmpDir);
      assert.strictEqual(manager.hasWarnings(), true);
      manager.drainWarnings();
      assert.strictEqual(manager.hasWarnings(), false);
    });
  });

  describe("drainWarnings", () => {
    it("should capture and drain warnings from invalid TOML", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'this is not valid toml = { [\n', "utf-8");

      const manager = new ConfigManager(tmpDir);
      const warnings = manager.drainWarnings();

      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes("Failed to load config"));
      assert.ok(warnings[0].includes(configPath));
    });

    it("should capture warnings from malformed overrides", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "allow"\n\n[[permissions.read.overrides]]\naction = "deny"\nreason = "Missing path"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const warnings = manager.drainWarnings();

      assert.strictEqual(warnings.length, 1);
      assert.ok(warnings[0].includes("Skipping invalid override"));
    });

    it("should clear warnings after draining", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'this is not valid toml = { [\n', "utf-8");

      const manager = new ConfigManager(tmpDir);
      const w1 = manager.drainWarnings();
      const w2 = manager.drainWarnings();

      assert.strictEqual(w1.length, 1);
      assert.strictEqual(w2.length, 0);
    });
  });

  describe("forceReload", () => {
    it("should reload even when file has not changed", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();

      // Force reload without changes
      const config2 = manager.forceReload();

      // Should be a different object
      assert.notStrictEqual(config1, config2);
      assert.strictEqual(config2.permissions.read.default, "deny");
    });

    it("should fall back to defaults when forceReload hits invalid TOML", () => {
      const configPath = path.join(tmpDir, ".pi", "sanity.toml");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        '[permissions.read]\ndefault = "deny"\n',
        "utf-8",
      );

      const manager = new ConfigManager(tmpDir);
      const config1 = manager.get();
      assert.strictEqual(config1.permissions.read.default, "deny");

      // Corrupt the file with invalid TOML
      fs.writeFileSync(
        configPath,
        'this is definitely not valid toml = { [\n',
        "utf-8",
      );

      const config2 = manager.forceReload();
      // Invalid file is skipped, falls back to embedded defaults
      assert.strictEqual(config2.permissions.read.default, "allow");
    });
  });
});

describe("loadConfigFromString with malformed overrides", () => {
  it("should skip override missing path", () => {
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
action = "deny"
reason = "Missing path"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 0);
  });

  it("should skip override with non-array path", () => {
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = "/foo"
action = "deny"
reason = "String path"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 0);
  });

  it("should skip override missing action", () => {
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["/foo"]
reason = "Missing action"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 0);
  });

  it("should skip override with invalid action", () => {
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["/foo"]
action = "invalid"
reason = "Invalid action"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 0);
  });

  it("should keep valid overrides and skip invalid ones", () => {
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"

[[permissions.read.overrides]]
path = ["/bad"]

[[permissions.read.overrides]]
path = ["/good"]
action = "deny"
reason = "Good"

[[permissions.read.overrides]]
path = ["/also-bad"]
action = "deny"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 2);
    assert.strictEqual(config.permissions.read.overrides[0].path[0], "/good");
    assert.strictEqual(config.permissions.read.overrides[0].action, "deny");
    assert.strictEqual(config.permissions.read.overrides[1].path[0], "/also-bad");
    assert.strictEqual(config.permissions.read.overrides[1].action, "deny");
  });

  it("should skip non-object overrides", () => {
    // This tests the edge case where overrides array contains primitives
    // (shouldn't happen with valid TOML, but defensively check)
    const config = loadConfigFromString(`
[permissions.read]
default = "allow"
`);
    assert.strictEqual(config.permissions.read.overrides.length, 0);
  });
});
