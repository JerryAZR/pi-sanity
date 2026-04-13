import { describe, it } from "node:test";
import assert from "node:assert";
import { walkBash } from "../../../src/bash-walker.js";

describe("walkBash", () => {
  describe("simple commands", () => {
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

    it("should extract command with multiple args", () => {
      const result = walkBash("cp file1 file2 file3 dest/");
      assert.deepStrictEqual(result.commands[0].args, [
        "file1",
        "file2",
        "file3",
        "dest/",
      ]);
    });

    it("should handle empty command", () => {
      const result = walkBash("");
      assert.strictEqual(result.commands.length, 0);
    });
  });

  describe("pipelines", () => {
    it("should extract pipeline commands", () => {
      const result = walkBash("cat file.txt | grep pattern");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "cat");
      assert.strictEqual(result.commands[1].name, "grep");
    });
  });

  describe("redirects", () => {
    it("should extract output redirect", () => {
      const result = walkBash("echo hello > output.txt");
      assert.strictEqual(result.commands[0].name, "echo");
      assert.strictEqual(result.commands[0].redirects.length, 1);
      assert.strictEqual(result.commands[0].redirects[0].operator, ">");
      assert.strictEqual(result.commands[0].redirects[0].target, "output.txt");
      assert.strictEqual(result.commands[0].redirects[0].isOutput, true);
      assert.strictEqual(result.commands[0].redirects[0].isInput, false);
    });

    it("should extract input redirect", () => {
      const result = walkBash("cat < input.txt");
      assert.strictEqual(result.commands[0].redirects[0].operator, "<");
      assert.strictEqual(result.commands[0].redirects[0].isInput, true);
      assert.strictEqual(result.commands[0].redirects[0].isOutput, false);
    });

    it("should handle standalone redirect without command", () => {
      const result = walkBash("> output.txt");
      assert.ok(result.commands.length >= 0);
    });
  });

  describe("subshells", () => {
    it("should extract subshell commands", () => {
      const result = walkBash("(cd /tmp && rm file)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "cd");
      assert.strictEqual(result.commands[1].name, "rm");
    });
  });

  describe("command substitution", () => {
    it("should extract inner command from command substitution in args", () => {
      const result = walkBash("cat $(rm /secret)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["/secret"]);
      assert.strictEqual(result.commands[1].name, "cat");
    });

    it("should extract inner command from backtick substitution", () => {
      const result = walkBash("`which rm` file");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "which");
      assert.deepStrictEqual(result.commands[0].args, ["rm"]);
    });

    it("should recursively extract nested command substitutions", () => {
      const result = walkBash("$(echo $(rm /))");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["/"]);
      assert.strictEqual(result.commands[1].name, "echo");
    });

    it("should extract command substitution from redirect target", () => {
      const result = walkBash("cat > $(echo /etc/file)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "echo");
      assert.deepStrictEqual(result.commands[0].args, ["/etc/file"]);
    });

    it("should handle multiple command substitutions", () => {
      const result = walkBash("cat $(echo file1) $(echo file2)");
      assert.strictEqual(result.commands.length, 3);
      assert.strictEqual(result.commands[0].name, "echo");
      assert.strictEqual(result.commands[1].name, "echo");
      assert.strictEqual(result.commands[2].name, "cat");
    });
  });

  describe("process substitution", () => {
    it("should extract commands from input process substitution", () => {
      const result = walkBash("cat <(echo content)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "echo");
      assert.deepStrictEqual(result.commands[0].args, ["content"]);
      assert.strictEqual(result.commands[1].name, "cat");
    });

    it("should extract commands from output process substitution", () => {
      const result = walkBash("echo data > >(tee log.txt)");
      assert.strictEqual(result.commands.length, 2);
      assert.strictEqual(result.commands[0].name, "tee");
      assert.deepStrictEqual(result.commands[0].args, ["log.txt"]);
      assert.strictEqual(result.commands[1].name, "echo");
    });
  });
});
