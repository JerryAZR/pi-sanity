import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import { checkRead, loadDefaultConfig } from "../../../src/index.js";

describe("checkRead with default config", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();

  describe("regular files", () => {
    it("should allow reading regular files in HOME", () => {
      const result = checkRead(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow reading regular files in CWD", () => {
      const result = checkRead("package.json", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow reading regular files in TMPDIR", () => {
      const result = checkRead(`${os.tmpdir()}/temp.txt`, config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("hidden files in HOME", () => {
    it("should ask for ~/.bashrc", () => {
      const result = checkRead(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.zshrc", () => {
      const result = checkRead(`${home}/.zshrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.config/app/settings.json", () => {
      const result = checkRead(`${home}/.config/app/settings.json`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should allow SSH public key", () => {
      const result = checkRead(`${home}/.ssh/id_rsa.pub`, config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("node_modules exception", () => {
    it("should allow reading from node_modules in .nvm", () => {
      const result = checkRead(
        `${home}/.nvm/versions/node/v20.0.0/lib/node_modules/@types/node/index.d.ts`,
        config
      );
      assert.strictEqual(result.action, "allow");
    });

    it("should allow reading pi documentation from node_modules", () => {
      const result = checkRead(
        `${home}/.nvm/versions/node/v24.14.1/lib/node_modules/@mariozechner/pi-coding-agent/docs/providers.md`,
        config
      );
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("hidden files in CWD", () => {
    it("should allow .env in CWD", () => {
      const result = checkRead(".env", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow .gitignore in CWD", () => {
      const result = checkRead(".gitignore", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("system directories", () => {
    it("should allow reading /etc/passwd (read default is allow)", () => {
      const result = checkRead("/etc/passwd", config);
      // Note: read default is allow, only hidden files in home are ask
      assert.strictEqual(result.action, "allow");
    });
  });
});
