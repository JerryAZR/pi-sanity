import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("checkBash with default config", () => {
  const config = loadDefaultConfig();

  describe("safe commands", () => {
    it("should allow ls -la", () => {
      const result = checkBash("ls -la", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cat file.txt", () => {
      const result = checkBash("cat file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow grep pattern file", () => {
      const result = checkBash("grep pattern file", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("dangerous commands", () => {
    it("should deny dd", () => {
      const result = checkBash("dd if=/dev/zero of=/tmp/test", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("package managers", () => {
    it("should allow npm install (local)", () => {
      const result = checkBash("npm install package", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny npm install -g (global)", () => {
      const result = checkBash("npm install -g package", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny npm --global install", () => {
      const result = checkBash("npm --global install package", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny yarn global add", () => {
      const result = checkBash("yarn global add package", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("file operations", () => {
    it("should allow cp in CWD", () => {
      const result = checkBash("cp file.txt backup/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny cp to /etc/", () => {
      const result = checkBash("cp file.txt /etc/", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should allow mv in CWD", () => {
      const result = checkBash("mv file.txt archive/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm in CWD", () => {
      const result = checkBash("rm file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny rm in /etc/", () => {
      const result = checkBash("rm /etc/config", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("parse errors", () => {
    it("should deny commands with parse errors", () => {
      const result = checkBash('echo "unclosed', config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("redirections", () => {
    it("should allow redirect to /dev/null", () => {
      const result = checkBash("echo test >/dev/null", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow stderr redirect to /dev/null", () => {
      const result = checkBash("rm -f test.txt 2>/dev/null", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny redirect to /etc/", () => {
      const result = checkBash("echo test >/etc/file", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});
