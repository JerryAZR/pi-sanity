import { describe, it } from "node:test";
import assert from "node:assert";
import { checkWrite, loadConfig, loadConfigFromString } from "../src/index.js";

describe("checkWrite (public API)", () => {
  describe("with inline config (unit tests)", () => {
    it("should allow write when config allows", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "allow"
`);
      const result = checkWrite("/any/path", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny write when config denies", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "deny"
reason = "Writes are denied"
`);
      const result = checkWrite("/etc/passwd", config);
      assert.strictEqual(result.action, "deny");
      assert.strictEqual(result.reason, "Writes are denied");
    });

    it("should ask when config asks", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "ask"
reason = "Please confirm write"
`);
      const result = checkWrite("/some/path", config);
      assert.strictEqual(result.action, "ask");
      assert.strictEqual(result.reason, "Please confirm write");
    });

    it("should protect system directories", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "allow"

[[permissions.write.overrides]]
path = ["/etc/**", "/usr/**", "/bin/**"]
action = "deny"
reason = "System directories are protected"
`);
      // System paths should be denied
      assert.strictEqual(checkWrite("/etc/config", config).action, "deny");
      assert.strictEqual(checkWrite("/usr/bin/app", config).action, "deny");
      assert.strictEqual(checkWrite("/bin/ls", config).action, "deny");

      // Regular paths allowed
      assert.strictEqual(checkWrite("/home/user/file", config).action, "allow");
    });

    it("should allow temp directory writes", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "ask"

[[permissions.write.overrides]]
path = ["/tmp/**", "/var/tmp/**"]
action = "allow"
reason = "Temp directories are safe"
`);
      assert.strictEqual(checkWrite("/tmp/test", config).action, "allow");
      assert.strictEqual(checkWrite("/var/tmp/test", config).action, "allow");
      assert.strictEqual(checkWrite("/home/file", config).action, "ask");
    });
  });

  describe("with default config (e2e-ish)", () => {
    it("should use default config behavior", () => {
      const config = loadConfig();

      // Write behavior with default config
      // Default config should have reasonable defaults
      const result = checkWrite("/any/file.txt", config);
      // Result depends on default-config.toml contents
      assert.ok(["allow", "ask", "deny"].includes(result.action));
    });
  });

  describe("edge cases", () => {
    it("should handle empty path", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "allow"
`);
      const result = checkWrite("", config);
      assert.ok(["allow", "ask", "deny"].includes(result.action));
    });

    it("should handle relative paths", () => {
      const config = loadConfigFromString(`
[permissions.write]
default = "allow"
`);
      const result = checkWrite("./relative/path", config);
      assert.strictEqual(result.action, "allow");
    });
  });
});
