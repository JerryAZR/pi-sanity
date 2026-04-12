import { describe, it } from "node:test";
import assert from "node:assert";
import { checkRead, loadDefaultConfig } from "../src/index.js";
import * as os from "os";

/**
 * Tests for hidden file pattern matching
 * 
 * These tests verify that hidden files AND files inside hidden directories
 * are properly matched by the hidden file patterns.
 */

describe("hidden file pattern matching", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();

  describe("files directly in home (traditional hidden files)", () => {
    it("should ask for ~/.bashrc", () => {
      const result = checkRead("~/.bashrc", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.zshrc", () => {
      const result = checkRead("~/.zshrc", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should allow ~/.ssh/id_rsa.pub (explicit exception)", () => {
      const result = checkRead("~/.ssh/id_rsa.pub", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("files inside hidden directories (BUG: was not matched by .*)", () => {
    it("should ask for files in ~/.nvm (nested deeply)", () => {
      const result = checkRead("~/.nvm/versions/node/v20.0.0/lib/file.js", config);
      assert.strictEqual(result.action, "ask",
        "Files inside hidden directories like .nvm should be protected");
    });

    it("should ask for files in ~/.config", () => {
      const result = checkRead("~/.config/app/settings.json", config);
      assert.strictEqual(result.action, "ask",
        "Files inside .config should be protected");
    });

    it("should ask for files in ~/.local/share", () => {
      const result = checkRead("~/.local/share/applications/app.desktop", config);
      assert.strictEqual(result.action, "ask",
        "Files inside .local should be protected");
    });

    it("should ask for files in ~/.cache", () => {
      const result = checkRead("~/.cache/npm/content/file", config);
      assert.strictEqual(result.action, "ask",
        "Files inside .cache should be protected");
    });
  });

  describe("regular files (should be allowed)", () => {
    it("should allow ~/Documents/file.txt", () => {
      const result = checkRead("~/Documents/file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow ~/Downloads/file.zip", () => {
      const result = checkRead("~/Downloads/file.zip", config);
      assert.strictEqual(result.action, "allow");
    });
  });

});
