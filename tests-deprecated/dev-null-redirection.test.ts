/**
 * Test that /dev/null redirections are allowed
 * These are common patterns in bash scripts and should not be blocked
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../src/index.js";

const config = loadDefaultConfig();

describe("/dev/null redirections", () => {
  it("should allow stderr redirection to /dev/null", () => {
    const command = "rm -f test.txt 2>/dev/null";
    const result = checkBash(command, config);
    
    // Should NOT block due to /dev/null
    assert.ok(
      result.action !== "deny" || !result.reason?.includes("outside allowed"),
      `Should not block /dev/null redirection but got: ${result.reason}`
    );
  });

  it("should allow stdout redirection to /dev/null", () => {
    const command = "echo 'test' >/dev/null";
    const result = checkBash(command, config);
    
    assert.ok(
      result.action !== "deny" || !result.reason?.includes("outside allowed"),
      `Should not block /dev/null redirection but got: ${result.reason}`
    );
  });

  it("should allow both stdout and stderr to /dev/null", () => {
    const command = "some_command >/dev/null 2>&1";
    const result = checkBash(command, config);
    
    assert.ok(
      result.action !== "deny" || !result.reason?.includes("outside allowed"),
      `Should not block /dev/null redirection but got: ${result.reason}`
    );
  });

  it("should still block actual writes outside allowed locations", () => {
    const command = "echo 'test' >/etc/test_file";
    const result = checkBash(command, config);
    
    assert.strictEqual(result.action, "deny", "Should block writes to /etc");
  });
});
