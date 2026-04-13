import { describe, it } from "node:test";
import assert from "node:assert";
import { walkBash } from "../src/bash-walker.js";

describe("bash-walker - command substitution", () => {
  describe("command substitution extraction", () => {
    it("should extract inner command from command substitution in name", () => {
      // $(echo rm) file.txt should extract 'echo rm' as inner command
      // NOTE: We CANNOT determine the outer command name is "rm" without
      // evaluating the substitution, which we don't do.
      // The outer command name will be "$(echo rm)" (literal text).
      // This is a known limitation - see LIMITATIONS.md
      const result = walkBash("$(echo rm) file.txt");
      
      // Should have 2 commands: the inner 'echo rm' and the outer execution
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command should be extracted
      assert.strictEqual(result.commands[0].name, "echo");
      assert.deepStrictEqual(result.commands[0].args, ["rm"]);
      
      // Outer command name is the literal "$(echo rm)", not "rm"
      // (evaluating the substitution would be required to know it's "rm")
      assert.strictEqual(result.commands[1].name, "$(echo rm)");
    });

    it("should extract inner command from command substitution in args", () => {
      // cat $(rm /secret) should extract both 'rm /secret' and 'cat ...'
      const result = walkBash("cat $(rm /secret)");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command (the dangerous one!)
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["/secret"]);
      
      // Outer command
      assert.strictEqual(result.commands[1].name, "cat");
    });

    it("should extract inner command from backtick substitution", () => {
      const result = walkBash("`which rm` file");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command
      assert.strictEqual(result.commands[0].name, "which");
      assert.deepStrictEqual(result.commands[0].args, ["rm"]);
    });

    it("should recursively extract nested command substitutions", () => {
      // $(echo $(rm /)) should extract both 'echo $(rm /)' and 'rm /'
      const result = walkBash("$(echo $(rm /))");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Innermost command (most dangerous!)
      assert.strictEqual(result.commands[0].name, "rm");
      assert.deepStrictEqual(result.commands[0].args, ["/"]);
      
      // Outer echo command
      assert.strictEqual(result.commands[1].name, "echo");
    });

    it("should extract command substitution from redirect target", () => {
      // cat > $(echo /etc/file) should extract 'echo /etc/file'
      const result = walkBash("cat > $(echo /etc/file)");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command from redirect
      assert.strictEqual(result.commands[0].name, "echo");
      assert.deepStrictEqual(result.commands[0].args, ["/etc/file"]);
      
      // Outer cat command with redirect
      assert.strictEqual(result.commands[1].name, "cat");
      assert.strictEqual(result.commands[1].redirects[0].target, "$(echo /etc/file)");
    });

    it("should handle multiple command substitutions", () => {
      // cat $(echo file1) $(echo file2) should extract both echo commands
      const result = walkBash("cat $(echo file1) $(echo file2)");
      
      // Should have 3 commands: echo file1, echo file2, cat ...
      assert.strictEqual(result.commands.length, 3);
      
      // Both echo commands extracted
      assert.strictEqual(result.commands[0].name, "echo");
      assert.strictEqual(result.commands[1].name, "echo");
      
      // Outer cat
      assert.strictEqual(result.commands[2].name, "cat");
    });
  });

  describe("process substitution extraction", () => {
    it("should extract commands from input process substitution", () => {
      // Process substitution: <(cmd) provides input from command
      const result = walkBash("cat <(echo content)");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command from <(...)
      assert.strictEqual(result.commands[0].name, "echo");
      assert.deepStrictEqual(result.commands[0].args, ["content"]);
      
      // Outer cat
      assert.strictEqual(result.commands[1].name, "cat");
    });

    it("should extract commands from output process substitution", () => {
      // Output process substitution: >(cmd) receives output
      const result = walkBash("echo data > >(tee log.txt)");
      
      assert.strictEqual(result.commands.length, 2);
      
      // Inner command from >(...)
      assert.strictEqual(result.commands[0].name, "tee");
      assert.deepStrictEqual(result.commands[0].args, ["log.txt"]);
      
      // Outer echo
      assert.strictEqual(result.commands[1].name, "echo");
    });
  });
});
