import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "node:os";
import { checkBash, loadDefaultConfig } from "../src/index.js";

/**
 * Tests for .git protection edge cases using ACTUAL default config
 */

describe("Git protection edge cases - with fixed default config", () => {
  const config = loadDefaultConfig();
  const tmpdir = os.tmpdir();

  describe("Issue 1: CWD/.git writes - git protection should take precedence", () => {
    it("writing to CWD/.git/config should be ASK (git protection)", () => {
      const result = checkBash("echo 'evil' > .git/config", config);
      assert.strictEqual(result.action, "ask",
        "Writing to .git/config should ASK due to **/.git/** protection");
    });

    it("writing to CWD/.git/HEAD should be ASK (git protection)", () => {
      const result = checkBash("cp file.txt .git/HEAD", config);
      assert.strictEqual(result.action, "ask",
        "Writing to .git/HEAD should ASK due to **/.git/** protection");
    });

    it("writing to normal CWD/file.txt should be ALLOW", () => {
      const result = checkBash("echo 'hello' > file.txt", config);
      assert.strictEqual(result.action, "allow",
        "Writing to normal file should be allowed");
    });
  });

  describe("Issue 2: Submodule .git directories should be protected", () => {
    it("writing to submodule/.git/config should ASK", () => {
      // **/.git/** should match any .git directory anywhere
      const result = checkBash("echo 'evil' > libs/submodule/.git/config", config);
      assert.strictEqual(result.action, "ask",
        "Writing to submodule .git should be protected by **/.git/** pattern");
    });

    it("writing to vendor/lib/.git/HEAD should ASK", () => {
      const result = checkBash("cp file.txt vendor/lib/.git/HEAD", config);
      assert.strictEqual(result.action, "ask",
        "Writing to any .git directory should be protected");
    });
  });

  describe("Issue 3: TMPDIR deletion should be allowed", () => {
    it("deleting in TMPDIR should be ALLOWED", () => {
      const result = checkBash(`rm ${tmpdir}/test-file.txt`, config);
      assert.strictEqual(result.action, "allow",
        "Deleting in TMPDIR should be allowed - low harm, practical for temp files");
    });

    it("deleting CWD file should be ALLOWED", () => {
      const result = checkBash("rm file.txt", config);
      assert.strictEqual(result.action, "allow",
        "Deleting in CWD should be allowed");
    });
  });

});
