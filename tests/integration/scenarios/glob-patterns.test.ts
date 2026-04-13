import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("glob pattern scenarios", () => {
  const config = loadDefaultConfig();

  describe("glob patterns in CWD (allowed)", () => {
    it("should allow rm *.txt in CWD", () => {
      const result = checkBash("rm *.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm **/*.log in CWD", () => {
      const result = checkBash("rm **/*.log", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cat *.log in CWD", () => {
      const result = checkBash("cat *.log", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cp *.txt backup/", () => {
      const result = checkBash("cp *.txt backup/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow mv *.txt archive/", () => {
      const result = checkBash("mv *.txt archive/", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("special characters in filenames", () => {
    it("should allow rm file#1.txt", () => {
      const result = checkBash("rm file#1.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cat file@2.txt", () => {
      const result = checkBash("cat file@2.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm [abc].txt", () => {
      const result = checkBash("rm [abc].txt", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("glob patterns in system directories (deny)", () => {
    it("should deny rm -rf /etc/*.conf", () => {
      const result = checkBash("rm -rf /etc/*.conf", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny rm -rf /var/log/*.log", () => {
      const result = checkBash("rm -rf /var/log/*.log", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny rm -rf /usr/share/*.txt", () => {
      const result = checkBash("rm -rf /usr/share/*.txt", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny rm -rf /*", () => {
      const result = checkBash("rm -rf /*", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("write outside CWD (deny)", () => {
    it("should deny cp *.txt /etc/", () => {
      const result = checkBash("cp *.txt /etc/", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny mv *.txt /var/", () => {
      const result = checkBash("mv *.txt /var/", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});
