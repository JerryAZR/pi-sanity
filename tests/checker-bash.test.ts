import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadConfig, loadConfigFromString } from "../src/index.js";

describe("checkBash (public API)", () => {
  describe("with inline config (unit tests)", () => {
    it("should allow safe commands by default", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"
`);
      const result = checkBash("echo hello", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny commands when default is deny", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "deny"
reason = "All commands denied"
`);
      const result = checkBash("echo hello", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should use command-specific rules", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[commands.rm]
default_action = "ask"
reason = "Deletion requires confirmation"
`);
      // rm should ask
      const rmResult = checkBash("rm file.txt", config);
      assert.strictEqual(rmResult.action, "ask");

      // Other commands allowed
      const echoResult = checkBash("echo hello", config);
      assert.strictEqual(echoResult.action, "allow");
    });

    it("should check paths in commands", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[permissions.read]
default = "deny"

[[permissions.read.overrides]]
path = ["/public/**"]
action = "allow"

[commands.cat]
default_action = "allow"

[commands.cat.positionals]
default_perm = "read"
`);
      // cat /secret/file should fail (read denied)
      const secretResult = checkBash("cat /secret/file", config);
      assert.strictEqual(secretResult.action, "deny");

      // cat /public/file should succeed
      const publicResult = checkBash("cat /public/file", config);
      assert.strictEqual(publicResult.action, "allow");
    });

    it("should check write paths in redirects", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[permissions.write]
default = "deny"

[[permissions.write.overrides]]
path = ["/tmp/**"]
action = "allow"
`);
      // Redirect to /etc should fail
      const etcResult = checkBash("echo test > /etc/file", config);
      assert.strictEqual(etcResult.action, "deny");

      // Redirect to /tmp should succeed
      const tmpResult = checkBash("echo test > /tmp/file", config);
      assert.strictEqual(tmpResult.action, "allow");
    });

    it("should check cp source and destination", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[permissions.read]
default = "allow"

[permissions.write]
default = "deny"

[[permissions.write.overrides]]
path = ["/tmp/**"]
action = "allow"

[commands.cp]
default_action = "allow"

[commands.cp.positionals]
default_perm = "read"
overrides = { "-1" = "write" }
`);
      // cp /src /tmp/dst - read src OK, write dst OK (in /tmp)
      const tmpResult = checkBash("cp /src/file /tmp/dst", config);
      assert.strictEqual(tmpResult.action, "allow");

      // cp /src /etc/dst - read src OK, write dst denied
      const etcResult = checkBash("cp /src/file /etc/dst", config);
      assert.strictEqual(etcResult.action, "deny");
    });

    it("should respect command flags", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[commands.rm]
default_action = "allow"

[commands.rm.flags]
"--force" = { action = "deny", reason = "Force is dangerous" }
`);
      // Normal rm allowed
      const normalResult = checkBash("rm file.txt", config);
      assert.strictEqual(normalResult.action, "allow");

      // rm --force denied
      const forceResult = checkBash("rm --force file.txt", config);
      assert.strictEqual(forceResult.action, "deny");
      assert.strictEqual(forceResult.reason, "Force is dangerous");
    });

    it("should handle pipelines", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[commands.cat]
default_action = "allow"

[commands.cat.positionals]
default_perm = "read"

[permissions.read]
default = "deny"

[[permissions.read.overrides]]
path = ["/safe/**"]
action = "allow"
`);
      // Pipeline reading from secret should fail
      const badPipe = checkBash("cat /secret/file | grep pattern", config);
      assert.strictEqual(badPipe.action, "deny");

      // Pipeline reading from safe should succeed
      const goodPipe = checkBash("cat /safe/file | grep pattern", config);
      assert.strictEqual(goodPipe.action, "allow");
    });

    it("should return strictest action from multiple issues", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"

[commands.cp]
default_action = "allow"

[commands.cp.positionals]
default_perm = "read"
overrides = { "-1" = "write" }

[permissions.write]
default = "ask"

[permissions.read]
default = "ask"
`);
      // A command that involves both read and write
      // Both ask, so result is ask
      const result = checkBash("cp /src /dst", config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("with default config (e2e-ish)", () => {
    it("should use default config for common commands", () => {
      const config = loadConfig();

      // Test various commands against default config
      const echoResult = checkBash("echo hello", config);
      const catResult = checkBash("cat file.txt", config);
      const rmResult = checkBash("rm file.txt", config);

      // Just verify they return valid actions
      for (const result of [echoResult, catResult, rmResult]) {
        assert.ok(["allow", "ask", "deny"].includes(result.action));
      }
    });

    it("should handle complex real-world commands", () => {
      const config = loadConfig();

      // Complex pipeline
      const pipeline = checkBash("cat file.txt | grep pattern | head -10", config);
      assert.ok(["allow", "ask", "deny"].includes(pipeline.action));

      // Command with redirects
      const redirect = checkBash("cat < input.txt > output.txt", config);
      assert.ok(["allow", "ask", "deny"].includes(redirect.action));
    });
  });

  describe("edge cases", () => {
    it("should handle empty command", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"
`);
      const result = checkBash("", config);
      assert.ok(["allow", "ask", "deny"].includes(result.action));
    });

    it("should handle command with only whitespace", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"
`);
      const result = checkBash("   ", config);
      assert.ok(["allow", "ask", "deny"].includes(result.action));
    });

    it("should handle subshells", () => {
      const config = loadConfigFromString(`
[commands._]
default_action = "allow"
`);
      const result = checkBash("(cd /tmp && rm file)", config);
      assert.ok(["allow", "ask", "deny"].includes(result.action));
    });
  });
});
