import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash } from "../src/checker-bash.js";
import { loadDefaultConfig } from "../src/config-loader.js";

/**
 * E2E tests for glob pattern handling
 * 
 * These tests verify that glob patterns are properly checked against path permissions.
 */

describe("checkBash E2E - glob patterns", () => {
  const config = loadDefaultConfig();

  describe("glob patterns should be checked (not crash)", () => {
    // These tests verify that glob patterns don't cause the checker to crash
    // or return undefined/incorrect results
    
    it("rm *.txt returns a valid result", () => {
      const result = checkBash("rm *.txt", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result with an action");
      assert.ok(["allow", "ask", "deny"].includes(result.action),
        "Action should be allow, ask, or deny");
    });

    it("rm **/*.log returns a valid result", () => {
      const result = checkBash("rm **/*.log", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });

    it("cat *.log returns a valid result", () => {
      const result = checkBash("cat *.log", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });

    it("cp *.txt backup/ returns a valid result", () => {
      const result = checkBash("cp *.txt backup/", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });

    it("mv *.txt archive/ returns a valid result", () => {
      const result = checkBash("mv *.txt archive/", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });

    it("tar czf backup.tar.gz *.js returns a valid result", () => {
      const result = checkBash("tar czf backup.tar.gz *.js", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });

    it("chmod 755 *.sh returns a valid result", () => {
      const result = checkBash("chmod 755 *.sh", config);
      
      assert.ok(result && typeof result.action === "string",
        "Should return a valid result");
    });
  });

  describe("paths with special characters should be checked", () => {
    // These tests verify that paths with #, @, etc. don't get rejected
    // (Previously, clearlyNotAPath would reject these)
    
    it("rm file#1.txt returns a valid result", () => {
      const result = checkBash("rm file#1.txt", config);
      
      assert.ok(result && typeof result.action === "string",
        "Path with # should be checked, not rejected");
    });

    it("cat file@2.txt returns a valid result", () => {
      const result = checkBash("cat file@2.txt", config);
      
      assert.ok(result && typeof result.action === "string",
        "Path with @ should be checked, not rejected");
    });

    it("ls -la file?name.txt returns a valid result", () => {
      const result = checkBash("ls -la file?name.txt", config);
      
      assert.ok(result && typeof result.action === "string",
        "Path with ? should be checked, not rejected");
    });

    it("rm [abc].txt returns a valid result", () => {
      const result = checkBash("rm [abc].txt", config);
      
      assert.ok(result && typeof result.action === "string",
        "Path with [abc] should be checked, not rejected");
    });

    it("cp !(important).txt backup/ returns a valid result", () => {
      const result = checkBash("cp !(important).txt backup/", config);
      
      assert.ok(result && typeof result.action === "string",
        "Path with !(pattern) should be checked, not rejected");
    });
  });

  describe("specific behavior for glob delete in CWD", () => {
    // These tests verify the actual permission behavior
    
    it("rm *.txt in CWD should allow (default delete config)", () => {
      const result = checkBash("rm *.txt", config);
      
      // In CWD, deletion should be allowed by default config
      assert.strictEqual(result.action, "allow",
        "rm *.txt in CWD should be allowed");
    });

    it("rm -rf /etc/*.conf should deny or ask (system directory)", () => {
      const result = checkBash("rm -rf /etc/*.conf", config);
      
      // System directory deletion should be denied or require confirmation
      assert.ok(result.action === "deny" || result.action === "ask",
        "rm in /etc should be denied or ask");
    });
  });

});
