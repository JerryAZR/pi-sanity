import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("checkBash with default config", () => {
  const config = loadDefaultConfig();

  describe("safe commands", () => {
    it("should allow ls -la", () => {
      const result = checkBash("ls -la", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cat file.txt", () => {
      const result = checkBash("cat file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow grep pattern file", () => {
      const result = checkBash("grep pattern file", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("dangerous commands", () => {
    it("should deny dd", () => {
      const result = checkBash("dd if=/dev/zero of=/tmp/test", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("package managers", () => {
    it("should allow npm install (local)", () => {
      const result = checkBash("npm install package", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny npm install -g (global)", () => {
      const result = checkBash("npm install -g package", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny npm --global install", () => {
      const result = checkBash("npm --global install package", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny yarn global add", () => {
      const result = checkBash("yarn global add package", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("file operations", () => {
    it("should allow cp in CWD", () => {
      const result = checkBash("cp file.txt backup/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny cp to /etc/", () => {
      const result = checkBash("cp file.txt /etc/", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should allow mv in CWD", () => {
      const result = checkBash("mv file.txt archive/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm in CWD", () => {
      const result = checkBash("rm file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny rm in /etc/", () => {
      const result = checkBash("rm /etc/config", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("parse errors", () => {
    it("should deny commands with parse errors", () => {
      const result = checkBash('echo "unclosed', config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("redirections", () => {
    it("should allow redirect to /dev/null", () => {
      const result = checkBash("echo test >/dev/null", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow stderr redirect to /dev/null", () => {
      const result = checkBash("rm -f test.txt 2>/dev/null", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny redirect to /etc/", () => {
      const result = checkBash("echo test >/etc/file", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("dangerous commands in nested contexts", () => {
    it("should deny rm -rf / inside command substitution", () => {
      const result = checkBash("echo $(rm -rf /)", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny npm -g inside command substitution", () => {
      const result = checkBash("echo $(npm install -g package)", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should deny rm -rf / inside backticks", () => {
      const result = checkBash("cat `rm -rf /`", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in input process substitution", () => {
      const result = checkBash("cat <(rm -rf /)", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in output process substitution", () => {
      const result = checkBash("echo data > >(rm -rf /)", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in case statement", () => {
      const result = checkBash("case x in *) rm -rf / ;; esac", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in for loop wordlist", () => {
      const result = checkBash("for x in $(rm -rf /); do :; done", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in else branch with braces", () => {
      const result = checkBash("if false; then :; else { rm -rf /; }; fi", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in variable assignment", () => {
      const result = checkBash("VAR=$(rm -rf /)", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in test expression", () => {
      const result = checkBash("[[ -f $(rm -rf /) ]]", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in select loop", () => {
      const result = checkBash("select x in $(rm -rf /); do echo $x; done", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in coproc", () => {
      const result = checkBash("coproc rm -rf /", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in C-style for loop", () => {
      const result = checkBash("for ((i=0; i<1; i++)); do rm -rf /; done", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / in parameter expansion", () => {
      const result = checkBash("echo ${VAR:-$(rm -rf /)}", config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });

    it("should deny rm -rf / inside double quotes", () => {
      const result = checkBash('echo "running: $(rm -rf /)"', config);
      assert.ok(result.action === "deny" || result.action === "ask");
    });
  });
});
