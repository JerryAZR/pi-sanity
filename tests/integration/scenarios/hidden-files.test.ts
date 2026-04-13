import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import { checkRead, checkWrite, checkDelete, checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("hidden files scenarios", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();

  describe("files directly in home (traditional hidden files)", () => {
    it("should ask for ~/.bashrc read", () => {
      const result = checkRead(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.bashrc write", () => {
      const result = checkWrite(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.zshrc", () => {
      const result = checkRead(`${home}/.zshrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should allow SSH public key", () => {
      const result = checkRead(`${home}/.ssh/id_rsa.pub`, config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("files inside hidden directories", () => {
    it("should ask for files in ~/.config", () => {
      const result = checkRead(`${home}/.config/app/settings.json`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for files in ~/.local/share", () => {
      const result = checkRead(`${home}/.local/share/applications/app.desktop`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for files in ~/.cache", () => {
      const result = checkRead(`${home}/.cache/npm/content/file`, config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("npm package paths (allowed for docs/types)", () => {
    it("should allow reading from ~/.nvm node_modules", () => {
      const result = checkRead(
        `${home}/.nvm/versions/node/v20.0.0/lib/node_modules/@types/node/index.d.ts`,
        config
      );
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("hidden files in CWD (allowed)", () => {
    it("should allow .env read", () => {
      const result = checkRead(".env", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow .env write", () => {
      const result = checkWrite(".env", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow .gitignore write", () => {
      const result = checkWrite(".gitignore", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm .env", () => {
      const result = checkBash("rm .env", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm .prettierrc", () => {
      const result = checkBash("rm .prettierrc", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("bash scenarios with hidden files", () => {
    it("should allow echo to .env", () => {
      const result = checkBash("echo API_KEY=secret > .env", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow echo to .gitignore", () => {
      const result = checkBash("echo node_modules/ > .gitignore", config);
      assert.strictEqual(result.action, "allow");
    });
  });
});
