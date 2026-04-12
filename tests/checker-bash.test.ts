import { describe, it } from "node:test";
import assert from "node:assert";
import { checkBash, loadConfig, loadDefaultConfig, loadConfigFromString } from "../src/index.js";
import * as os from "node:os";

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

  describe("with default config (deterministic tests)", () => {
    it("should allow echo (no file operations)", () => {
      const config = loadDefaultConfig();
      const result = checkBash("echo hello", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow cat with readable file", () => {
      const config = loadDefaultConfig();
      // {{CWD}}/file should be allowed by default write overrides
      const result = checkBash("cat /project/file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should ask for hidden files in home", () => {
      const config = loadDefaultConfig();
      // {{HOME}}/.bashrc matches read override that asks
      const home = os.homedir().replace(/\\/g, "/");
      const result = checkBash(`cat ${home}/.bashrc`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should allow reading public ssh keys", () => {
      const config = loadDefaultConfig();
      // {{HOME}}/.ssh/*.pub is explicitly allowed
      const home = os.homedir().replace(/\\/g, "/");
      const result = checkBash(`cat ${home}/.ssh/id_rsa.pub`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm for files in cwd", () => {
      const config = loadDefaultConfig();
      // {{CWD}}/** has delete override "allow"
      // Using relative path which resolves to CWD
      const result = checkBash("rm file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow rm --force for files in cwd (no special flag handling)", () => {
      const config = loadDefaultConfig();
      // No --force flag rule in default config
      // Path is in CWD which is allowed for delete
      const result = checkBash("rm --force file.txt", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny npm global install", () => {
      const config = loadDefaultConfig();
      const result = checkBash("npm install -g package", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should allow npm local install", () => {
      const config = loadDefaultConfig();
      const result = checkBash("npm install package", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should deny pip outside virtualenv", () => {
      const config = loadDefaultConfig();
      // Delete VIRTUAL_ENV to simulate no venv
      const oldVenv = process.env.VIRTUAL_ENV;
      delete process.env.VIRTUAL_ENV;
      const result = checkBash("pip install package", config);
      process.env.VIRTUAL_ENV = oldVenv;
      assert.strictEqual(result.action, "deny");
    });

    it("should deny dd (blocked command)", () => {
      const config = loadDefaultConfig();
      const result = checkBash("dd if=/dev/zero of=/dev/null", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should allow writing to temp directory", () => {
      const config = loadDefaultConfig();
      // Use actual temp path that will match {{TMPDIR}} pattern
      const tmpDir = os.tmpdir().replace(/\\/g, "/");
      const result = checkBash(`echo test > ${tmpDir}/output.txt`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow writing to CWD", () => {
      const config = loadDefaultConfig();
      // Use actual cwd that will match {{CWD}} pattern
      const cwd = process.cwd().replace(/\\/g, "/");
      const result = checkBash(`echo test > ${cwd}/output.txt`, config);
      assert.strictEqual(result.action, "allow");
    });

    it("should handle pipelines with default config", () => {
      const config = loadDefaultConfig();
      // Pipeline of allowed commands
      const result = checkBash("cat file.txt | grep pattern", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("edge cases", () => {
    it("should allow empty command", () => {
      const config = loadDefaultConfig();
      const result = checkBash("", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should allow whitespace-only command", () => {
      const config = loadDefaultConfig();
      const result = checkBash("   ", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should handle subshells with default config", () => {
      const config = loadDefaultConfig();
      const result = checkBash("(cd /tmp && echo hello)", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should handle multiple commands in pipeline", () => {
      const config = loadDefaultConfig();
      const result = checkBash("cat a.txt | grep x | wc -l", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should ask when reading hidden files in home via pipeline", () => {
      const config = loadDefaultConfig();
      // {{HOME}}/.* has read override "ask"
      const home = os.homedir().replace(/\\/g, "/");
      const result = checkBash(`cat ${home}/.bashrc | grep alias`, config);
      assert.strictEqual(result.action, "ask");
    });

    it("should ask when reading hidden files in home via pipeline", () => {
      const config = loadDefaultConfig();
      const home = os.homedir().replace(/\\/g, "/");
      // Hidden file in home: {{HOME}}/.* has "ask" action
      const result = checkBash(`cat ${home}/.bashrc | grep alias`, config);
      assert.strictEqual(result.action, "ask");
    });
  });

  describe("parse error handling", () => {
    it("should deny commands with unterminated double quotes", () => {
      const config = loadDefaultConfig();
      const result = checkBash('echo "hello', config);
      assert.strictEqual(result.action, "deny");
      assert.ok(result.reason?.includes("Invalid bash syntax"));
      assert.ok(result.reason?.includes("unterminated double quote"));
    });

    it("should deny commands with unterminated backticks", () => {
      const config = loadDefaultConfig();
      const result = checkBash("echo `date", config);
      assert.strictEqual(result.action, "deny");
      assert.ok(result.reason?.includes("Invalid bash syntax"));
      assert.ok(result.reason?.includes("unterminated backtick"));
    });

    it("should deny incomplete if statements", () => {
      const config = loadDefaultConfig();
      const result = checkBash("if then", config);
      assert.strictEqual(result.action, "deny");
      assert.ok(result.reason?.includes("Invalid bash syntax"));
      assert.ok(result.reason?.includes("fi"));
    });

    it("should deny incomplete for loops", () => {
      const config = loadDefaultConfig();
      const result = checkBash("for do done", config);
      assert.strictEqual(result.action, "deny");
      assert.ok(result.reason?.includes("Invalid bash syntax"));
    });

    it("should deny incomplete case statements", () => {
      const config = loadDefaultConfig();
      const result = checkBash("case esac", config);
      assert.strictEqual(result.action, "deny");
      assert.ok(result.reason?.includes("Invalid bash syntax"));
    });

    it("should allow valid complex commands", () => {
      const config = loadDefaultConfig();
      const result = checkBash("echo $(echo nested)", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("tilde expansion in command args", () => {
    it("should treat ~/file as home directory for read checks", () => {
      const config = loadDefaultConfig();
      // Hidden files in home should ask for read
      const result = checkBash("cat ~/.bashrc", config);
      assert.strictEqual(result.action, "ask",
        "Tilde should expand to home, hidden files should ask");
    });

    it("should treat ~/.ssh/*.pub as allowed for read", () => {
      const config = loadDefaultConfig();
      // SSH public keys are explicitly allowed
      const result = checkBash("cat ~/.ssh/id_rsa.pub", config);
      assert.strictEqual(result.action, "allow",
        "SSH public keys should be allowed");
    });

    it("should treat ~/file as home directory for write checks", () => {
      const config = loadDefaultConfig();
      // Writing to home should ask
      const result = checkBash("echo hello > ~/file.txt", config);
      assert.strictEqual(result.action, "ask",
        "Tilde should expand to home, writes should ask");
    });

    it("should treat ~/file as home directory for delete checks", () => {
      const config = loadDefaultConfig();
      // Deleting in home should ask
      const result = checkBash("rm ~/documents/file.txt", config);
      assert.strictEqual(result.action, "ask",
        "Tilde should expand to home, deletes should ask");
    });

    it("should allow deleting hidden files in CWD with tilde (when cwd is home)", () => {
      // This test only makes sense when CWD is not home
      // Testing the general tilde behavior
      const config = loadDefaultConfig();
      const result = checkBash("rm ~/.local/share/file.txt", config);
      // This should match {{HOME}}/.* pattern and ask
      assert.strictEqual(result.action, "ask",
        "Tilde paths in home should follow home rules");
    });

    it("should handle tilde alone as home directory", () => {
      const config = loadDefaultConfig();
      const result = checkBash("ls ~", config);
      assert.strictEqual(result.action, "allow",
        "Reading home directory should be allowed");
    });

    it("should not expand ~user (username suffix)", () => {
      const config = loadDefaultConfig();
      // ~root should NOT be expanded, treated as literal path
      const result = checkBash("cat ~root/.bashrc", config);
      // This is a relative path "~root/.bashrc" which doesn't exist
      // Default read is allow
      assert.strictEqual(result.action, "allow",
        "~user syntax should not be expanded, treated as literal");
    });
  });
});
