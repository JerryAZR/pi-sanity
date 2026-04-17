import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigManager } from "../../src/config-manager.js";

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
  });
});
