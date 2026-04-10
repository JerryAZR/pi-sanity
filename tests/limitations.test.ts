/**
 * Limitations and Adversarial Tests
 * 
 * This test suite demonstrates known limitations of pi-sanity.
 * These tests are expected to FAIL - they document what the extension
 * currently CANNOT catch, providing direction for future improvements.
 * 
 * Run with: npm test -- --test-name-pattern="limitations"
 * Or exclude from CI: these are skipped in default runs
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../src/index.js";

// Skip these tests in normal CI runs
// Set RUN_LIMITATION_TESTS=true to include them
const shouldRun = process.env.RUN_LIMITATION_TESTS === "true";

const describeLimitations = shouldRun ? describe : describe.skip;

describeLimitations("Known Limitations (expected failures)", () => {
  const config = loadDefaultConfig();

  describe("Command Obfuscation", () => {
    it("should detect command substitution: $(echo rm) file", () => {
      // HARD TO FIX - See IMPLEMENTATION_NOTES.md#command-substitution
      // Currently: walkBash sees this as a command with args, doesn't expand $(echo rm)
      // Should: detect that $(echo rm) evaluates to "rm" and apply rm rules
      //
      // unbash DOES parse command substitution and exposes inner AST via "CommandExpansion" nodes
      // with a nested "script" property. The challenge is:
      // 1. CommandExpansion can appear anywhere (command name, args, etc.)
      // 2. We need to recursively walk the inner script
      // 3. Aggregate results from both outer and inner commands
      // 4. Handle nested substitutions: $(echo $(rm /))
      // 5. Inner commands need full permission checking too
      const result = checkBash("$(echo rm) file.txt", config);
      // Currently returns "allow" (wrong) - should be "ask" for delete
      assert.strictEqual(result.action, "ask", "Command substitution should be expanded and checked");
    });

    it("should detect backtick substitution: `which rm` file", () => {
      // HARD TO FIX - Same as above, unbash uses same "CommandExpansion" AST node
      // Backticks are legacy but parsed identically to $()
      const result = checkBash("`which rm` file.txt", config);
      assert.strictEqual(result.action, "ask", "Backtick substitution should be expanded and checked");
    });

    it("should detect eval: eval 'rm file'", () => {
      // eval executes arbitrary strings - extremely dangerous
      // Currently: treated as generic command
      // Should: parse the string argument and check it as bash
      const result = checkBash("eval 'rm file.txt'", config);
      assert.strictEqual(result.action, "ask", "eval should parse and check its argument");
    });

    it("should detect bash -c: bash -c 'rm file'", () => {
      // bash -c executes a command string
      // Currently: treated as bash with args
      // Should: parse the -c argument as bash and check it
      const result = checkBash("bash -c 'rm file.txt'", config);
      assert.strictEqual(result.action, "ask", "bash -c should parse and check its argument");
    });

    it("should detect sh -c: sh -c 'rm file'", () => {
      const result = checkBash("sh -c 'rm file.txt'", config);
      assert.strictEqual(result.action, "ask", "sh -c should parse and check its argument");
    });

    it("should detect obfuscated path: /bi'n'/rm", () => {
      // String concatenation in path
      // Currently: treated as literal path
      const result = checkBash("/bi'n'/rm file.txt", config);
      assert.strictEqual(result.action, "ask", "String concatenation in paths should be resolved");
    });
  });

  describe("Dynamic Path Resolution", () => {
    it("should detect find with exec: find / -exec rm {} \\;", () => {
      // find with -exec runs command on each file
      // Currently: only checks the find command itself
      // Should: check the -exec command for each matched file
      const result = checkBash("find /home -name '*.tmp' -exec rm {} \\;", config);
      assert.strictEqual(result.action, "ask", "find -exec should check the executed command");
    });

    it("should detect xargs: cat files.txt | xargs rm", () => {
      // xargs takes stdin and runs command with those args
      // Extremely dangerous - can delete arbitrary files
      const result = checkBash("cat files.txt | xargs rm", config);
      assert.strictEqual(result.action, "ask", "xargs should be treated as potentially dangerous");
    });

    it("should detect process substitution: cat <(cat /etc/passwd)", () => {
      // Process substitution creates temporary files
      // Currently: may not properly track the inner command
      const result = checkBash("cat <(cat /etc/passwd) | grep root", config);
      // The inner "cat /etc/passwd" should be checked for read permission
      assert.strictEqual(result.action, "deny", "Process substitution inner commands should be checked");
    });
  });

  describe("Path Traversal", () => {
    it("should detect symlink traversal: rm /home/user/link-to-secret", () => {
      // If /home/user/link-to-secret -> /etc/secret
      // Currently: checks the path literally
      // Should: resolve symlinks and check the real path
      const result = checkBash("rm /home/user/link-to-secret", config);
      // If link points to /etc, this should be denied
      assert.strictEqual(result.action, "deny", "Symlinks should be resolved before checking");
    });

    it("should detect path traversal: rm /safe/../../etc/passwd", () => {
      // Path traversal attack
      // Currently: checks the literal path
      // Should: normalize the path (resolve ..) before checking
      const result = checkBash("rm /safe/../../etc/passwd", config);
      assert.strictEqual(result.action, "deny", "Path traversal should be normalized and checked");
    });

    it("should detect environment variable in path: rm $SECRET_DIR/file", () => {
      // Environment variable expansion in paths
      // Currently: $SECRET_DIR stays as literal string
      // Should: expand env vars before checking
      const result = checkBash("rm $SECRET_DIR/file.txt", config);
      // If SECRET_DIR=/etc, this should be denied
      assert.strictEqual(result.action, "deny", "Environment variables in paths should be expanded");
    });
  });

  describe("Alias and Function Bypass", () => {
    it("should detect alias bypass: \\rm file", () => {
      // \command bypasses aliases
      // Currently: treated as \rm (literal)
      // Should: recognize this as rm command
      const result = checkBash("\\rm file.txt", config);
      assert.strictEqual(result.action, "ask", "Backslash prefix should be stripped and command checked");
    });

    it("should detect function override: command rm file", () => {
      // command rm bypasses shell functions
      // Currently: may not recognize "command rm" as rm
      const result = checkBash("command rm file.txt", config);
      assert.strictEqual(result.action, "ask", "command builtin should be stripped");
    });

    it("should detect builtin override: builtin rm file", () => {
      // builtin rm bypasses functions
      const result = checkBash("builtin rm file.txt", config);
      assert.strictEqual(result.action, "ask", "builtin keyword should be stripped");
    });
  });

  describe("Complex Nesting", () => {
    it("should detect nested eval: eval $(echo 'rm file')", () => {
      // Multiple layers of obfuscation
      const result = checkBash("eval $(echo 'rm file.txt')", config);
      assert.strictEqual(result.action, "ask", "Nested eval/substitution should be recursively checked");
    });

    it("should detect subshell with obfuscation: (cd /tmp && $(echo rm) file)", () => {
      // Subshell + command substitution
      const result = checkBash("(cd /tmp && $(echo rm) file.txt)", config);
      assert.strictEqual(result.action, "ask", "Subshell commands should be fully checked");
    });

    it("should detect here document with command: cat <<EOF | rm", () => {
      // Here document feeding into command
      const result = checkBash("cat <<EOF | rm -f\nfile.txt\nEOF", config);
      // The rm at the end should still be checked
      assert.strictEqual(result.action, "ask", "Here documents shouldn't bypass command checking");
    });
  });

  describe("Indirect Execution", () => {
    it("should detect source with dynamic content: source /tmp/evil.sh", () => {
      // source (.) executes commands from file
      // Currently: treated as read operation
      // Should: recognize this executes code
      const result = checkBash("source /tmp/evil.sh", config);
      assert.strictEqual(result.action, "deny", "source should check that the file is safe to execute");
    });

    it("should detect script execution: ./malicious.sh", () => {
      // Executing a script runs arbitrary code
      // Currently: treated as execution of unknown command
      // Should: ideally parse the script (hard) or at least warn
      const result = checkBash("./malicious.sh", config);
      assert.strictEqual(result.action, "ask", "Script execution should be flagged for review");
    });

    it("should detect exec: exec rm file", () => {
      // exec replaces the shell process
      const result = checkBash("exec rm file.txt", config);
      assert.strictEqual(result.action, "ask", "exec should check its command");
    });
  });
});

describe("Honest Assessment Summary", () => {
  it("documents current limitations for contributors", () => {
    console.log(`
=== PI-SANITY LIMITATION SUMMARY ===

Current Blind Spots:
1. Command Obfuscation: $(echo rm), \`which rm\`, eval, bash -c
2. Dynamic Paths: find -exec, xargs, process substitution
3. Path Traversal: symlinks, ../, unexpanded env vars
4. Alias Bypass: \\rm, command rm, builtin rm
5. Complex Nesting: Multiple layers of eval/substitution
6. Indirect Execution: source, ./scripts, exec

Why These Are Hard:
- Command substitution requires execution or complex static analysis
- Dynamic paths depend on runtime state (files that don't exist yet)
- Path traversal requires filesystem access to resolve
- Nested parsing requires recursive bash parsing

Potential Improvements:
1. Add "dangerous command whitelist" - any obfuscated command = ask
2. Expand command substitution statically when possible
3. Add runtime path resolution (resolve symlinks, normalize)
4. Flag all indirect execution as "ask" by default
5. Better handling of eval/bash -c (parse argument as sub-command)

Contributions Welcome:
- Pick a limitation and implement a fix
- Add more adversarial test cases
- Improve bash-walker to handle edge cases
- Add heuristics for obfuscation detection
`);
    assert.strictEqual(true, true); // This test always passes
  });
});
