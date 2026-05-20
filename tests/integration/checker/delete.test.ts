import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
// This file previously tested checkDelete. Since the delete permission has been
// merged into write, deletion is now checked against permissions.write.
// These tests have been updated to use checkWrite to verify the same behavior.
import { checkWrite, loadDefaultConfig } from "../../../src/index.js";

describe("checkWrite (delete behavior) with default config", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();
  const tmpdir = os.tmpdir();

  describe("HOME directory", () => {
    it("should ask for regular files in HOME", () => {
      const result = checkWrite(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for hidden files in HOME", () => {
      const result = checkWrite(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("CWD (allowed)", () => {
    it("should allow regular files in CWD", () => {
      const result = checkWrite("file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow hidden files in CWD", () => {
      const result = checkWrite(".env", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("TMPDIR (allowed)", () => {
    it("should allow regular files in TMPDIR", () => {
      const result = checkWrite(`${tmpdir}/file.txt`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow hidden files in TMPDIR", () => {
      const result = checkWrite(`${tmpdir}/.hidden`, config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("git protection", () => {
    it("should ask for .git/config", () => {
      const result = checkWrite(".git/config", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for files in .git/", () => {
      const result = checkWrite(".git/objects/abc", config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("system directories (deny)", () => {
    it("should deny /etc/file", () => {
      const result = checkWrite("/etc/file", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny /usr/bin/app", () => {
      const result = checkWrite("/usr/bin/app", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});
