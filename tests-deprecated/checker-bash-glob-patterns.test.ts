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

  describe("glob patterns in CWD should be allowed", () => {
    // All these commands operate on paths in CWD (current working directory)
    // Per default config:
    // - delete: {{CWD}}/** has "allow" override
    // - read: default is "allow"
    // - write: {{CWD}}/** has "allow" override
    
    it("rm *.txt should allow (delete in CWD is allowed)", () => {
      const result = checkBash("rm *.txt", config);
      
      assert.strictEqual(result.action, "allow",
        "rm *.txt in CWD should be allowed - delete in CWD is permitted by default config");
    });

    it("rm **/*.log should allow (delete in CWD is allowed)", () => {
      const result = checkBash("rm **/*.log", config);
      
      assert.strictEqual(result.action, "allow",
        "rm **/*.log in CWD should be allowed - delete in CWD is permitted");
    });

    it("cat *.log should allow (read default is allow)", () => {
      const result = checkBash("cat *.log", config);
      
      assert.strictEqual(result.action, "allow",
        "cat *.log should be allowed - read default is allow");
    });

    it("cp *.txt backup/ should allow (read from CWD, write to CWD)", () => {
      const result = checkBash("cp *.txt backup/", config);
      
      assert.strictEqual(result.action, "allow",
        "cp *.txt backup/ should be allowed - read from CWD, write to CWD both allowed");
    });

    it("mv *.txt archive/ should allow (read+delete from CWD, write to CWD)", () => {
      const result = checkBash("mv *.txt archive/", config);
      
      assert.strictEqual(result.action, "allow",
        "mv *.txt archive/ should be allowed - all operations in CWD are permitted");
    });

    it("tar czf backup.tar.gz *.js should allow (unknown commands default to allow)", () => {
      const result = checkBash("tar czf backup.tar.gz *.js", config);
      
      assert.strictEqual(result.action, "allow",
        "tar should be allowed - unknown commands default to allow, no positional checks configured");
    });

    it("chmod 755 *.sh should allow (unknown commands default to allow)", () => {
      const result = checkBash("chmod 755 *.sh", config);
      
      assert.strictEqual(result.action, "allow",
        "chmod should be allowed - unknown commands default to allow, no positional checks configured");
    });
  });

  describe("paths with special characters in CWD should be allowed", () => {
    // These paths contain characters that might be rejected by path validation
    // They should be treated as valid paths and checked normally
    
    it("rm file#1.txt should allow (delete in CWD)", () => {
      const result = checkBash("rm file#1.txt", config);
      
      assert.strictEqual(result.action, "allow",
        "rm file#1.txt should be allowed - # character should not cause rejection, delete in CWD is permitted");
    });

    it("cat file@2.txt should allow (read default is allow)", () => {
      const result = checkBash("cat file@2.txt", config);
      
      assert.strictEqual(result.action, "allow",
        "cat file@2.txt should be allowed - @ character should not cause rejection");
    });

    it("ls -la file?name.txt should allow (unknown commands default to allow)", () => {
      const result = checkBash("ls -la file?name.txt", config);
      
      assert.strictEqual(result.action, "allow",
        "ls file?name.txt should be allowed - ? character should not cause rejection");
    });

    it("rm [abc].txt should allow (delete in CWD)", () => {
      const result = checkBash("rm [abc].txt", config);
      
      assert.strictEqual(result.action, "allow",
        "rm [abc].txt should be allowed - [abc] should not cause rejection, delete in CWD is permitted");
    });

    it("cp !(important).txt backup/ should allow (read+write in CWD)", () => {
      const result = checkBash("cp !(important).txt backup/", config);
      
      assert.strictEqual(result.action, "allow",
        "cp !(important).txt backup/ should be allowed - extglob pattern should not cause rejection");
    });
  });

  describe("glob patterns in protected directories should be denied", () => {
    // System directories have explicit deny overrides for delete
    // Per default config: {{HOME}}, /, /etc, /usr, /var all have "deny" for delete
    
    it("rm -rf /etc/*.conf should deny (system directory)", () => {
      const result = checkBash("rm -rf /etc/*.conf", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /etc/*.conf should be denied - /etc has explicit deny override for delete");
    });

    it("rm -rf /var/log/*.log should deny (system directory)", () => {
      const result = checkBash("rm -rf /var/log/*.log", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /var/log/*.log should be denied - /var has explicit deny override for delete");
    });

    it("rm -rf /usr/share/*.txt should deny (system directory)", () => {
      const result = checkBash("rm -rf /usr/share/*.txt", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /usr/share/*.txt should be denied - /usr has explicit deny override for delete");
    });

    it("rm -rf /* should deny (root directory)", () => {
      const result = checkBash("rm -rf /*", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /* should be denied - / has explicit deny override for delete");
    });
  });

  describe("write operations outside CWD should be denied", () => {
    // Write default is "deny" with overrides only for {{HOME}} (ask) and {{CWD}}/{{TMPDIR}} (allow)
    // Writing to system directories falls through to default = deny
    
    it("cp *.txt /etc/ should deny (write outside CWD/TMPDIR/HOME)", () => {
      const result = checkBash("cp *.txt /etc/", config);
      
      assert.strictEqual(result.action, "deny",
        "cp *.txt /etc/ should deny - write default is deny, /etc is not in allow overrides");
    });

    it("mv *.txt /var/ should deny (write outside CWD/TMPDIR/HOME)", () => {
      const result = checkBash("mv *.txt /var/", config);
      
      assert.strictEqual(result.action, "deny",
        "mv *.txt /var/ should deny - write default is deny, /var is not in allow overrides");
    });
  });

  describe("debug: literal path without glob should match system deny rules", () => {
    // Testing if the issue is with glob patterns or path matching in general
    
    it("rm -rf /etc/hosts should deny (literal system path)", () => {
      const result = checkBash("rm -rf /etc/hosts", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /etc/hosts should be denied - /etc path should match deny override");
    });

    it("rm -rf /var should deny (literal system path)", () => {
      const result = checkBash("rm -rf /var", config);
      
      assert.strictEqual(result.action, "deny",
        "rm -rf /var should be denied - /var path should match deny override");
    });
  });

});
