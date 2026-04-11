import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash } from "../src/checker-bash.js";
import { loadDefaultConfig } from "../src/config-loader.js";

/**
 * E2E tests asserting CORRECT security behavior.
 * 
 * These tests assert that dangerous commands SHOULD be denied.
 * Currently these tests FAIL because the commands bypass checks.
 * 
 * When the gaps are fixed, these tests will pass.
 */

describe("checkBash E2E - commands should be denied", () => {
  const config = loadDefaultConfig();

  // ============================================================================
  // Command substitution - should catch dangerous commands
  // ============================================================================
  describe("Command substitution should be checked", () => {
    it("should deny rm -rf / in command substitution", () => {
      const result = checkBash("echo $(rm -rf /)", config);
      
      // The 'rm -rf /' should be detected and denied
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / inside $(...) should be denied or ask for confirmation");
    });

    it.skip("should flag or deny dynamic command name via substitution (limitation: cannot evaluate)", () => {
      // LIMITATION: $(echo rm) -rf / 
      // We can extract 'echo rm' as an inner command, but we cannot evaluate
      // what 'echo rm' outputs to know the outer command is 'rm'.
      // 
      // This requires either:
      // 1. Executing the command substitution (dangerous, out of scope)
      // 2. Static analysis heuristics (flag any command name containing '$')
      //
      // For now, we accept this limitation. The inner 'echo rm' will be checked,
      // but the outer dynamic command name cannot be validated.
      const result = checkBash("$(echo rm) -rf /", config);
      
      // Current: allows (command name is "$(echo rm)", not recognized as "rm")
      // Future: could flag with "ask" for any dynamic command name
      console.log("Dynamic command name result:", result);
    });

    it("should deny dangerous command in backtick substitution", () => {
      const result = checkBash("cat `rm -rf /`", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / inside backticks should be denied or ask");
    });

    it("should deny nested command substitutions", () => {
      const result = checkBash("$(echo $(rm -rf /))", config);
      
      // Both 'echo' and 'rm' should be checked
      assert.ok(result.action === "deny" || result.action === "ask",
        "Nested command substitutions should be checked");
    });
  });

  // ============================================================================
  // Process substitution - should catch dangerous commands
  // ============================================================================
  describe("Process substitution should be checked", () => {
    it("should deny rm -rf / in input process substitution", () => {
      const result = checkBash("cat <(rm -rf /)", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / inside <(...) should be denied or ask");
    });

    it("should deny dangerous command in output process substitution", () => {
      const result = checkBash("echo data > >(rm -rf /)", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / inside >(...) should be denied or ask");
    });
  });

  // ============================================================================
  // Case statements - should catch dangerous commands
  // ============================================================================
  describe("Case statements should be checked", () => {
    it("should deny rm -rf / in case statement body", () => {
      const result = checkBash("case x in *) rm -rf / ;; esac", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in case statement should be denied or ask");
    });

    it("should deny multiple dangerous commands in case branches", () => {
      const script = `
        case $var in
          a) rm -rf / ;;
          b) dd if=/dev/zero of=/dev/sda ;;
          c) npm install -g malicious-package ;;
        esac
      `;
      const result = checkBash(script, config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "Dangerous commands in case branches should be denied or ask");
    });
  });

  // ============================================================================
  // For loop wordlist - should catch dangerous commands
  // ============================================================================
  describe("For loop wordlist should be checked", () => {
    it("should deny rm -rf / in for loop wordlist", () => {
      const result = checkBash("for x in $(rm -rf /); do :; done", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in for loop wordlist should be denied or ask");
    });

    it("should deny backtick command in for loop wordlist", () => {
      const result = checkBash("for x in `rm -rf /`; do echo $x; done", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in backtick wordlist should be denied or ask");
    });
  });

  // ============================================================================
  // If-else CompoundList - should catch dangerous commands
  // ============================================================================
  describe("Else branch CompoundList should be checked", () => {
    it("should deny rm -rf / in else branch with braces", () => {
      const result = checkBash("if false; then :; else { rm -rf /; }; fi", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in else branch should be denied or ask");
    });
  });

  // ============================================================================
  // Assignments - should catch dangerous commands
  // ============================================================================
  describe("Variable assignments should be checked", () => {
    it("should deny rm -rf / in assignment value", () => {
      const result = checkBash("VAR=$(rm -rf /)", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in assignment should be denied or ask");
    });

    it("should deny rm -rf / in array assignment", () => {
      const result = checkBash("ARR=($(rm -rf /))", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in array assignment should be denied or ask");
    });
  });

  // ============================================================================
  // Test expressions - should catch dangerous commands
  // ============================================================================
  describe("Test expressions should be checked", () => {
    it("should deny rm -rf / in test expression operand", () => {
      const result = checkBash("[[ -f $(rm -rf /) ]]", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in [[...]] should be denied or ask");
    });

    it("should deny rm -rf / in binary test expression", () => {
      const result = checkBash("[[ $(echo a) == $(rm -rf /) ]]", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in [[...]] comparison should be denied or ask");
    });
  });

  // ============================================================================
  // Select loops - should catch dangerous commands
  // ============================================================================
  describe("Select loops should be checked", () => {
    it("should deny rm -rf / in select loop", () => {
      const result = checkBash("select x in $(rm -rf /); do echo $x; done", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in select loop should be denied or ask");
    });
  });

  // ============================================================================
  // Coprocess - should catch dangerous commands
  // ============================================================================
  describe("Coprocesses should be checked", () => {
    it("should deny rm -rf / in coproc", () => {
      const result = checkBash("coproc rm -rf /", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in coproc should be denied or ask");
    });

    it("should deny rm -rf / in named coproc", () => {
      const result = checkBash("coproc MYPROC { rm -rf /; echo done; }", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in coproc body should be denied or ask");
    });
  });

  // ============================================================================
  // Arithmetic for loops - should catch dangerous commands
  // ============================================================================
  describe("C-style for loops should be checked", () => {
    it("should deny rm -rf / in C-style for loop body", () => {
      const result = checkBash("for ((i=0; i<1; i++)); do rm -rf /; done", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in C-style for body should be denied or ask");
    });
  });

  // ============================================================================
  // Parameter expansion defaults - should catch dangerous commands
  // ============================================================================
  describe("Parameter expansion should be checked", () => {
    it("should deny rm -rf / in parameter expansion default", () => {
      const result = checkBash("echo ${VAR:-$(rm -rf /)}", config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / in ${VAR:-...} should be denied or ask");
    });
  });

  // ============================================================================
  // Double-quoted strings - should catch dangerous commands
  // ============================================================================
  describe("Double-quoted strings should be checked", () => {
    it("should deny rm -rf / inside double quotes via substitution", () => {
      const result = checkBash('echo "running: $(rm -rf /)"', config);
      
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm -rf / inside double quotes should be denied or ask");
    });
  });

  // ============================================================================
  // Comparison: Direct vs wrapped - should have same result
  // ============================================================================
  describe("Consistency: direct command vs wrapped command", () => {
    it("direct rm -rf / should be denied (baseline)", () => {
      const result = checkBash("rm -rf /", config);
      
      assert.strictEqual(result.action, "deny",
        "Direct 'rm -rf /' must be denied");
    });

    it("rm -rf / in $() should ALSO be denied (currently bypassed)", () => {
      const result = checkBash("echo $(rm -rf /)", config);
      
      // This should be denied just like the direct version
      assert.strictEqual(result.action, "deny",
        "rm -rf / must be denied even when wrapped in $()");
    });

    it("direct npm -g install should be denied (baseline)", () => {
      const result = checkBash("npm install -g package", config);
      
      assert.strictEqual(result.action, "deny",
        "Direct 'npm install -g' must be denied");
    });

    it("npm -g install in $() should ALSO be denied (currently bypassed)", () => {
      const result = checkBash("echo $(npm install -g package)", config);
      
      // This should be denied just like the direct version
      assert.strictEqual(result.action, "deny",
        "npm install -g must be denied even when wrapped in $()");
    });
  });
});
