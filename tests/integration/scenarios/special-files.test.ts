import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("special files scenarios", () => {
  const config = loadDefaultConfig();

  describe("/dev/null redirections", () => {
    it("should allow stderr redirection to /dev/null", () => {
      const result = checkBash("rm -f test.txt 2>/dev/null", config);
      assert.ok(result.action !== "deny" || !result.reason?.includes("outside allowed"));
    });

    it("should allow stdout redirection to /dev/null", () => {
      const result = checkBash("echo 'test' >/dev/null", config);
      assert.ok(result.action !== "deny" || !result.reason?.includes("outside allowed"));
    });

    it("should allow both stdout and stderr to /dev/null", () => {
      const result = checkBash("some_command >/dev/null 2>&1", config);
      assert.ok(result.action !== "deny" || !result.reason?.includes("outside allowed"));
    });
  });

  describe("/dev/stdout and /dev/stderr", () => {
    it("should allow redirect to /dev/stdout", () => {
      const result = checkBash("echo test >/dev/stdout", config);
      assert.ok(result.action !== "deny" || !result.reason?.includes("outside allowed"));
    });

    it("should allow redirect to /dev/stderr", () => {
      const result = checkBash("echo error >/dev/stderr", config);
      assert.ok(result.action !== "deny" || !result.reason?.includes("outside allowed"));
    });
  });

  describe("actual system writes should still be blocked", () => {
    it("should deny write to /etc/", () => {
      const result = checkBash("echo 'test' >/etc/test_file", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});
