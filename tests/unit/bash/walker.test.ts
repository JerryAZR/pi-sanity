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

  describe("advanced bash constructs", () => {
    it("should extract commands from else branch with braces", () => {
      const result = walkBash("if true; then :; else { rm file; }; fi");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("rm"), "Should extract 'rm' from else { ... }");
    });

    it("should extract commands from standalone braced groups", () => {
      const result = walkBash("{ echo start; rm file; echo end; }");
      assert.strictEqual(result.commands.length, 3);
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("rm"), "Should extract 'rm' from braced group");
    });

    it("should extract commands from case body", () => {
      const result = walkBash("case $x in a) rm file1 ;; b) rm file2 ;; esac");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("rm"), "Should extract 'rm' from case body");
    });

    it("should extract commands from case pattern expressions", () => {
      const result = walkBash("case $(echo a) in a) echo yes ;; esac");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("echo"), "Should extract 'echo' from case pattern");
    });

    it("should extract commands from for loop wordlist", () => {
      const result = walkBash("for x in $(ls); do echo $x; done");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("ls"), "Should extract 'ls' from for wordlist");
    });

    it("should extract commands from variable assignments", () => {
      const result = walkBash("VAR=$(echo value)");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("echo"), "Should extract 'echo' from VAR=$(...)");
    });

    it("should extract commands from array assignments", () => {
      const result = walkBash("ARR=($(echo a) $(echo b))");
      assert.ok(result.commands.length >= 2, "Should extract both 'echo' commands");
    });

    it("should extract commands from test expressions", () => {
      const result = walkBash("[[ -f $(echo file.txt) ]]");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("echo"), "Should extract 'echo' from [[ ... ]]");
    });

    it("should extract commands from binary test expressions", () => {
      const result = walkBash("[[ $(echo a) == $(echo b) ]]");
      assert.ok(result.commands.length >= 2, "Should extract both sides of comparison");
    });

    it("should extract commands from select loop", () => {
      const result = walkBash("select x in $(echo a); do rm $x; done");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("echo"), "Should extract 'echo' from select wordlist");
      assert.ok(names.includes("rm"), "Should extract 'rm' from select body");
    });

    it("should extract commands from coproc", () => {
      const result = walkBash("coproc echo hello");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("echo"), "Should extract 'echo' from coproc");
    });

    it("should extract commands from named coproc", () => {
      const result = walkBash("coproc MYPROC { echo start; rm file; }");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("rm"), "Should extract 'rm' from coproc body");
    });

    it("should extract commands from C-style for loop body", () => {
      const result = walkBash("for ((i=0; i<3; i++)); do rm file$i; done");
      const names = result.commands.map(c => c.name);
      assert.ok(names.includes("rm"), "Should extract 'rm' from for ((...)) body");
    });

    it("should extract commands from parameter expansion", () => {
      const result = walkBash("echo ${VAR:-$(echo default)}");
      const echoCount = result.commands.filter(c => c.name === "echo").length;
      assert.strictEqual(echoCount, 2, "Should extract both 'echo' commands");
    });

    it("should extract commands inside double quotes", () => {
      const result = walkBash('echo "result: $(echo inner)"');
      const echoCount = result.commands.filter(c => c.name === "echo").length;
      assert.strictEqual(echoCount, 2, "Should extract 'echo' inside double quotes");
    });
  });

  describe("security: dangerous commands in nested contexts", () => {
    it("must extract rm in command substitution", () => {
      const result = walkBash("echo $(rm -rf /)");
      assert.ok(result.commands.some(c => c.name === "rm"), "MUST extract 'rm' from $()");
    });

    it("must extract rm in else branch CompoundList", () => {
      const result = walkBash("if false; then :; else { rm -rf /; }; fi");
      assert.ok(result.commands.some(c => c.name === "rm"), "MUST extract 'rm' from else {}");
    });

    it("must extract rm in case statement", () => {
      const result = walkBash("case x in *) rm -rf / ;; esac");
      assert.ok(result.commands.some(c => c.name === "rm"), "MUST extract 'rm' from case");
    });

    it("must extract rm in for loop wordlist", () => {
      const result = walkBash("for f in $(rm -rf /); do :; done");
      assert.ok(result.commands.some(c => c.name === "rm"), "MUST extract 'rm' from for wordlist");
    });

    it("must extract rm in assignment", () => {
      const result = walkBash("VAR=$(rm -rf /)");
      assert.ok(result.commands.some(c => c.name === "rm"), "MUST extract 'rm' from VAR=$(...)");
    });
  });
});
