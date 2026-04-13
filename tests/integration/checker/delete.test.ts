import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import { checkDelete, loadDefaultConfig } from "../../../src/index.js";

describe("checkDelete with default config", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();
  const tmpdir = os.tmpdir();

  describe("HOME directory", () => {
    it("should ask for regular files in HOME", () => {
      const result = checkDelete(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for hidden files in HOME", () => {
      const result = checkDelete(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("CWD (allowed)", () => {
    it("should allow regular files in CWD", () => {
      const result = checkDelete("file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow hidden files in CWD", () => {
      const result = checkDelete(".env", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("TMPDIR (allowed)", () => {
    it("should allow regular files in TMPDIR", () => {
      const result = checkDelete(`${tmpdir}/file.txt`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow hidden files in TMPDIR", () => {
      const result = checkDelete(`${tmpdir}/.hidden`, config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("git protection", () => {
    it("should ask for .git/config", () => {
      const result = checkDelete(".git/config", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask for files in .git/", () => {
      const result = checkDelete(".git/objects/abc", config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("system directories (deny)", () => {
    it("should deny /etc/file", () => {
      const result = checkDelete("/etc/file", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny /usr/bin/app", () => {
      const result = checkDelete("/usr/bin/app", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});
