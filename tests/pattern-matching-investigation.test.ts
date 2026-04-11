import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadConfigFromString } from "../src/index.js";

/**
 * Investigation: Why aren't system paths being denied?
 * 
 * The default config has:
 *   path = ["{{HOME}}", "/", "/etc", "/usr", "/var"]
 * 
 * These are EXACT match patterns without /** 
 */

describe("Pattern matching investigation", () => {
  
  describe("exact path patterns (current config)", () => {
    const exactConfig = loadConfigFromString(`
[permissions.delete]
default = "ask"

[[permissions.delete.overrides]]
path = ["/etc", "/var", "/usr"]
action = "deny"
reason = "Exact match only"

[commands.rm]
default_action = "allow"

[commands.rm.positionals]
default_perm = "delete"
`);

    it("exact pattern /var matches /var", () => {
      const result = checkBash("rm /var", exactConfig);
      assert.strictEqual(result.action, "deny",
        "Exact pattern /var should match /var");
    });

    it("exact pattern /etc does NOT match /etc/hosts", () => {
      const result = checkBash("rm /etc/hosts", exactConfig);
      // This is the BUG: /etc doesn't match /etc/hosts
      // Result is "ask" (default) instead of "deny"
      assert.strictEqual(result.action, "ask",
        "BUG CONFIRMED: Exact pattern /etc does not match /etc/hosts - returns default 'ask'");
    });

    it("exact pattern /etc does NOT match /etc/*.conf", () => {
      const result = checkBash("rm /etc/*.conf", exactConfig);
      assert.strictEqual(result.action, "ask",
        "BUG CONFIRMED: Exact pattern /etc does not match /etc/*.conf - returns default 'ask'");
    });
  });

  describe("glob path patterns with /** (fixed config)", () => {
    const globConfig = loadConfigFromString(`
[permissions.delete]
default = "ask"

[[permissions.delete.overrides]]
path = ["/etc/**", "/var/**", "/usr/**"]
action = "deny"
reason = "Glob match for subpaths"

[commands.rm]
default_action = "allow"

[commands.rm.positionals]
default_perm = "delete"
`);

    it("glob pattern /etc/** matches /etc/hosts", () => {
      const result = checkBash("rm /etc/hosts", globConfig);
      assert.strictEqual(result.action, "deny",
        "Glob pattern /etc/** should match /etc/hosts");
    });

    it("glob pattern /etc/** matches /etc/*.conf", () => {
      const result = checkBash("rm /etc/*.conf", globConfig);
      assert.strictEqual(result.action, "deny",
        "Glob pattern /etc/** should match /etc/*.conf");
    });

    it("glob pattern /var/** matches /var/log/*.log", () => {
      const result = checkBash("rm /var/log/*.log", globConfig);
      assert.strictEqual(result.action, "deny",
        "Glob pattern /var/** should match /var/log/*.log");
    });
  });

  describe("root directory pattern /", () => {
    const rootConfig = loadConfigFromString(`
[permissions.delete]
default = "ask"

[[permissions.delete.overrides]]
path = ["/"]
action = "deny"
reason = "Root only"

[commands.rm]
default_action = "allow"

[commands.rm.positionals]
default_perm = "delete"
`);

    it("pattern / matches /", () => {
      const result = checkBash("rm /", rootConfig);
      assert.strictEqual(result.action, "deny",
        "Pattern / should match /");
    });

    it("pattern / does NOT match /*", () => {
      const result = checkBash("rm /*", rootConfig);
      // /* is a glob pattern, not the literal path /
      assert.strictEqual(result.action, "ask",
        "BUG: Pattern / does not match /* - need separate /* pattern or use /**");
    });
  });

});
