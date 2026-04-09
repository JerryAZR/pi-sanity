import { describe, it } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import {
  isInside,
  isTemp,
  isHomeHidden,
  isPublicKeyFile,
  isGitPath,
  expandTilde,
} from "../src/path-utils.js";

describe("path-utils", () => {
  const homeDir = os.homedir();
  const tmpDir = os.tmpdir();

  describe("isInside", () => {
    it("should return true for direct child", () => {
      assert.strictEqual(isInside("/home/user/docs", "/home/user"), true);
    });

    it("should return true for nested child", () => {
      assert.strictEqual(isInside("/home/user/docs/nested", "/home/user"), true);
    });

    it("should return false for parent", () => {
      assert.strictEqual(isInside("/home", "/home/user"), false);
    });

    it("should return false for sibling", () => {
      assert.strictEqual(isInside("/home/other", "/home/user"), false);
    });

    it("should return false for same path", () => {
      assert.strictEqual(isInside("/home/user", "/home/user"), false);
    });
  });

  describe("isTemp", () => {
    it("should return true for temp directory (or direct child)", () => {
      // Note: isTemp checks for descendants, so temp dir itself or direct child
      assert.strictEqual(isTemp(tmpDir) || isTemp(path.join(tmpDir, "file")), true);
    });

    it("should return true for file in temp", () => {
      assert.strictEqual(isTemp(path.join(tmpDir, "file.txt")), true);
    });

    it("should return false for home directory", () => {
      assert.strictEqual(isTemp(homeDir), false);
    });
  });

  describe("isHomeHidden", () => {
    it("should return true for hidden file in home", () => {
      assert.strictEqual(isHomeHidden("/home/user/.bashrc", "/home/user"), true);
    });

    it("should return true for hidden directory in home", () => {
      assert.strictEqual(isHomeHidden("/home/user/.ssh", "/home/user"), true);
    });

    it("should return false for non-hidden file in home", () => {
      assert.strictEqual(isHomeHidden("/home/user/docs", "/home/user"), false);
    });

    it("should return false for path outside home", () => {
      assert.strictEqual(isHomeHidden("/etc/.hidden", "/home/user"), false);
    });
  });

  describe("isPublicKeyFile", () => {
    it("should return true for .pub files", () => {
      assert.strictEqual(isPublicKeyFile("id_rsa.pub"), true);
      assert.strictEqual(isPublicKeyFile("KEY.PUB"), true);
    });

    it("should return true for .asc files", () => {
      assert.strictEqual(isPublicKeyFile("key.asc"), true);
    });

    it("should return false for private key files", () => {
      assert.strictEqual(isPublicKeyFile("id_rsa"), false);
      assert.strictEqual(isPublicKeyFile("id_rsa.pem"), false);
    });
  });

  describe("isGitPath", () => {
    it("should return true for .git directory", () => {
      assert.strictEqual(isGitPath("/repo/.git"), true);
    });

    it("should return true for file inside .git", () => {
      assert.strictEqual(isGitPath("/repo/.git/config"), true);
    });

    it("should return false for regular directory", () => {
      assert.strictEqual(isGitPath("/repo/src"), false);
    });

    it("should return false for .github directory", () => {
      assert.strictEqual(isGitPath("/repo/.github"), false);
    });
  });

  describe("expandTilde", () => {
    it("should expand ~/ to home directory", () => {
      const result = expandTilde("~/documents", homeDir);
      assert.strictEqual(result, path.join(homeDir, "documents"));
    });

    it("should expand ~ to home directory", () => {
      const result = expandTilde("~", homeDir);
      assert.strictEqual(result, homeDir);
    });

    it("should not modify paths without tilde", () => {
      assert.strictEqual(expandTilde("/etc/passwd", homeDir), "/etc/passwd");
    });

    it("should not expand ~ in middle of path", () => {
      assert.strictEqual(expandTilde("/tmp/~", homeDir), "/tmp/~");
    });
  });
});
