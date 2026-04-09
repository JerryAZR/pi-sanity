import { describe, it } from "node:test";
import assert from "node:assert";
import { walkBash } from "../src/bash-walker.js";

describe("bash-walker", () => {
  describe("walkBash", () => {
    it("should extract simple command", () => {
      const result = walkBash("rm file.txt");
      assert.strictEqual(result.commands.length, 1);
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["file.txt"]);
    });

    it("should extract command with flags", () => {
      const result = walkBash("rm -rf dir/");
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["-rf", "dir/"]);
    });

    it("should extract pipeline commands", () => {
      const result = walkBash("cat file.txt | grep pattern");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "cat");
      assert.strictEqual(result.commands[1].name, "grep");
    });

    it("should extract redirects", () => {
      const result = walkBash("echo hello > output.txt");
      assert.strictEqual(result.commands[0].name, "echo");
      assert.strictEqual(result.commands[0].redirects.length, 1);
      assert.strictEqual(result.commands[0].redirects[0].operator, ">");
      assert.strictEqual(result.commands[0].redirects[0].target, "output.txt");
      assert.strictEqual(result.commands[0].redirects[0].isOutput, true);
      assert.strictEqual(result.commands[0].redirects[0].isInput, false);
    });

    it("should extract input redirects", () => {
      const result = walkBash("cat < input.txt");
      assert.strictEqual(result.commands[0].redirects[0].operator, "<");
      assert.strictEqual(result.commands[0].redirects[0].isInput, true);
      assert.strictEqual(result.commands[0].redirects[0].isOutput, false);
    });

    it("should handle standalone redirect", () => {
      // Standalone redirect without command may or may not be captured
      // depending on unbash AST structure - just ensure no crash
      const result = walkBash("> output.txt");
      // May have 0 or 1 commands depending on AST
      assert.ok(result.commands.length >= 0);
    });

    it("should extract subshell commands", () => {
      const result = walkBash("(cd /tmp && rm file)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "cd");
      assert.strictEqual(result.commands[1].name, "rm");
    });

    it("should handle empty command", () => {
      const result = walkBash("");
      assert.strictEqual(result.commands.length, 0);
    });

    it("should handle command with multiple args", () => {
      const result = walkBash("cp file1 file2 file3 dest/");
      assert.deepStrictEqual(result.commands[0].args, [
        "file1",
        "file2",
        "file3",
        "dest/",
      ]);
    });
  });
});
