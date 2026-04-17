import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import { checkRead, checkWrite, checkDelete, checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("secret paths scenarios", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();

  describe("known credential locations", () => {
    it("should ask for ~/.aws/credentials", () => {
      const result = checkRead(`${home}/.aws/credentials`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.ssh/id_rsa (private key)", () => {
      const result = checkRead(`${home}/.ssh/id_rsa`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.netrc", () => {
      const result = checkRead(`${home}/.netrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.kube/config", () => {
      const result = checkRead(`${home}/.kube/config`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.docker/config.json", () => {
      const result = checkRead(`${home}/.docker/config.json`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for ~/.npmrc", () => {
      const result = checkRead(`${home}/.npmrc`, config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("safe paths that should be allowed", () => {
    it("should allow ~/.bashrc (shell config, not a secret)", () => {
      const result = checkRead(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow ~/.zshrc (shell config, not a secret)", () => {
      const result = checkRead(`${home}/.zshrc`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow ~/.cargo (Rust crate cache)", () => {
      const result = checkRead(`${home}/.cargo`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow files in ~/.config (generic app config)", () => {
      const result = checkRead(`${home}/.config/app/settings.json`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow files in ~/.cache", () => {
      const result = checkRead(`${home}/.cache/npm/content/file`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow SSH public key", () => {
      const result = checkRead(`${home}/.ssh/id_rsa.pub`, config);
      assert.strictEqual(result.action, "allow");
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
