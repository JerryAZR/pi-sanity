import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "node:os";
import { checkRead, checkWrite, checkBash, loadDefaultConfig } from "../src/index.js";
import { checkDelete } from "../src/path-permission.js";

/**
 * Test to verify hidden file permission coverage in default config
 * All hidden file operations in CWD and TMPDIR should work correctly
 */

describe("Hidden file permission coverage", () => {
  const config = loadDefaultConfig();
  const home = os.homedir();

  describe("READ permissions", () => {
    it("regular file in HOME should ALLOW (read default is allow)", () => {
      const result = checkRead(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "allow",
        "Regular file in HOME uses read default (allow)");
    });

    it("hidden file in HOME should ASK (explicit pattern exists)", () => {
      const result = checkRead(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask",
        "Hidden file in HOME has explicit pattern {{HOME}}/.*");
    });

    it("SSH public key should ALLOW", () => {
      const result = checkRead(`${home}/.ssh/id_rsa.pub`, config);
      assert.strictEqual(result.action, "allow",
        "SSH public key should be explicitly allowed");
    });

    it("regular file in CWD should ALLOW", () => {
      const result = checkRead("file.txt", config);
      assert.strictEqual(result.action, "allow",
        "Regular file read default is allow");
    });

    it("hidden file in CWD should ALLOW", () => {
      const result = checkRead(".env", config);
      assert.strictEqual(result.action, "allow",
        "Hidden file in CWD should be allowed for read (default is allow)");
    });
  });

  describe("WRITE permissions", () => {
    const tmpdir = os.tmpdir();
    
    it("regular file in HOME should ASK", () => {
      const result = checkWrite(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "ask",
        "Regular file write in HOME should ask");
    });

    it("hidden file in HOME should ASK (now covered by {{HOME}}/.*)", () => {
      const result = checkWrite(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask",
        "Hidden file write in HOME should ask ({{HOME}}/.* pattern added)");
    });

    it("regular file in CWD should ALLOW", () => {
      const result = checkWrite("file.txt", config);
      assert.strictEqual(result.action, "allow",
        "Regular file write in CWD should allow");
    });

    it("hidden file in CWD should ALLOW", () => {
      const result = checkWrite(".env", config);
      assert.strictEqual(result.action, "allow",
        "Hidden file .env in CWD should be allowed ({{CWD}}/.* pattern)");
    });

    it("file in .git/ should ASK (git protection)", () => {
      const result = checkWrite(".git/config", config);
      assert.strictEqual(result.action, "ask",
        ".git directory should be protected");
    });

    it("regular file in TMPDIR should ALLOW", () => {
      const result = checkWrite(`${tmpdir}/file.txt`, config);
      assert.strictEqual(result.action, "allow",
        "Regular file write in TMPDIR should allow");
    });

    it("hidden file in TMPDIR should ALLOW", () => {
      const result = checkWrite(`${tmpdir}/.hidden`, config);
      assert.strictEqual(result.action, "allow",
        "Hidden file in TMPDIR should be allowed ({{TMPDIR}}/.* pattern)");
    });
  });

  describe("DELETE permissions", () => {
    const tmpdir = os.tmpdir();
    
    it("regular file in HOME should ASK", () => {
      const result = checkDelete(`${home}/documents/file.txt`, config);
      assert.strictEqual(result.action, "ask",
        "Regular file delete in HOME should ask");
    });

    it("hidden file in HOME should ASK (now covered by {{HOME}}/.*)", () => {
      const result = checkDelete(`${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask",
        "Hidden file delete in HOME should ask ({{HOME}}/.* pattern added)");
    });

    it("regular file in CWD should ALLOW", () => {
      const result = checkDelete("file.txt", config);
      assert.strictEqual(result.action, "allow",
        "Regular file delete in CWD should allow");
    });

    it("hidden file in CWD should ALLOW", () => {
      const result = checkDelete(".gitignore", config);
      assert.strictEqual(result.action, "allow",
        "Hidden file .gitignore in CWD should be allowed ({{CWD}}/.* pattern)");
    });

    it("file in .git/ should ASK (git protection)", () => {
      const result = checkDelete(".git/config", config);
      assert.strictEqual(result.action, "ask",
        ".git directory should be protected");
    });

    it("regular file in TMPDIR should ALLOW", () => {
      const result = checkDelete(`${tmpdir}/file.txt`, config);
      assert.strictEqual(result.action, "allow",
        "Regular file delete in TMPDIR should allow");
    });

    it("hidden file in TMPDIR should ALLOW", () => {
      const result = checkDelete(`${tmpdir}/.hidden`, config);
      assert.strictEqual(result.action, "allow",
        "Hidden file delete in TMPDIR should be allowed ({{TMPDIR}}/.* pattern)");
    });
  });

  describe("BASH command scenarios with hidden files", () => {
    it("echo to .env should work", () => {
      const result = checkBash("echo API_KEY=secret > .env", config);
      assert.strictEqual(result.action, "allow",
        "Creating .env file in CWD should be allowed");
    });

    it("echo to .gitignore should work", () => {
      const result = checkBash("echo node_modules/ > .gitignore", config);
      assert.strictEqual(result.action, "allow",
        "Creating .gitignore in CWD should be allowed");
    });

    it("rm .env should work", () => {
      const result = checkBash("rm .env", config);
      assert.strictEqual(result.action, "allow",
        "Deleting .env in CWD should be allowed");
    });

    it("rm .prettierrc should work", () => {
      const result = checkBash("rm .prettierrc", config);
      assert.strictEqual(result.action, "allow",
        "Deleting .prettierrc in CWD should be allowed");
    });
  });

  describe("deeply nested hidden directory coverage", () => {
    // These tests document the glob matching behavior with hidden directories
    // Node.js path.matchesGlob() ** does NOT traverse into hidden directories
    // even with { dot: true } option

    it("level 1: file in hidden dir ~/.local/share/file.txt", () => {
      const result = checkDelete(`${home}/.local/share/file.txt`, config);
      // This currently fails - ** doesn't traverse into .local
      assert.strictEqual(result.action, "ask",
        "Files inside hidden directories should be covered by home rules");
    });

    it("level 2: file in nested hidden dir ~/.config/app/settings.json", () => {
      const result = checkDelete(`${home}/.config/app/settings.json`, config);
      assert.strictEqual(result.action, "ask",
        "Files in nested paths under hidden dirs should be covered");
    });

    it("level 3: deeply nested ~/.local/share/applications/app.desktop", () => {
      const result = checkDelete(`${home}/.local/share/applications/app.desktop`, config);
      assert.strictEqual(result.action, "ask",
        "Deeply nested files in hidden dirs should be covered");
    });

    it("level 4+: very deep nesting ~/.cache/npm/_cacache/content-v2/...", () => {
      const result = checkDelete(`${home}/.cache/npm/_cacache/content-v2/sha512/aa/bb/cc/file`, config);
      assert.strictEqual(result.action, "ask",
        "Very deeply nested files should still be covered by home rules");
    });

    it("hidden file inside hidden dir ~/.ssh/.config (rare but possible)", () => {
      const result = checkDelete(`${home}/.ssh/.config`, config);
      assert.strictEqual(result.action, "ask",
        "Hidden files inside hidden directories should be covered");
    });

    it("mixed: non-hidden file in non-hidden subdir of hidden dir ~/.local/bin/myapp", () => {
      const result = checkDelete(`${home}/.local/bin/myapp`, config);
      assert.strictEqual(result.action, "ask",
        "Non-hidden files in non-hidden subdirs of hidden dirs should be covered");
    });

    it("arbitrarily deep nesting ~/.a/.b/.c/.d/.e/.f/file.txt", () => {
      const result = checkDelete(`${home}/.a/.b/.c/.d/.e/.f/file.txt`, config);
      assert.strictEqual(result.action, "ask",
        "Arbitrarily deep nested hidden directories should be covered by home rules");
    });
  });
});
