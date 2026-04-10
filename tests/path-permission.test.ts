import { describe, it } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import {
  matchesGlob,
  checkPathPermission,
  checkRead,
  checkWrite,
  checkDelete,
  getDefaultContext,
} from "../src/path-permission.js";
import { normalizeFilePath, type PathContext } from "../src/path-utils.js";
import { createEmptyConfig } from "../src/config-types.js";
import type { SanityConfig, PermissionSection } from "../src/config-types.js";

describe("path-permission", () => {
  const homeDir = os.homedir();
  const tmpDir = os.tmpdir();
  const testContext: PathContext = {
    cwd: "/project",
    home: "/home/user",
    repo: "/project",
    tmpdir: "/tmp",
  };

  describe("matchesGlob", () => {
    it("should match exact path", () => {
      assert.strictEqual(matchesGlob("/home/user/file.txt", "/home/user/file.txt"), true);
    });

    it("should match with * wildcard", () => {
      assert.strictEqual(matchesGlob("/home/user/file.txt", "/home/user/*.txt"), true);
      assert.strictEqual(matchesGlob("/home/user/file.log", "/home/user/*.txt"), false);
    });

    it("should match with ** wildcard", () => {
      assert.strictEqual(matchesGlob("/home/user/a/b/c/file.txt", "/home/user/**/*.txt"), true);
      assert.strictEqual(matchesGlob("/home/user/file.txt", "/home/user/**/*.txt"), true);
    });

    it("should match with ? wildcard", () => {
      assert.strictEqual(matchesGlob("/home/user/file.txt", "/home/user/file.t?t"), true);
      assert.strictEqual(matchesGlob("/home/user/file.txxt", "/home/user/file.t?t"), false);
    });

    it("should match hidden files with .*", () => {
      assert.strictEqual(matchesGlob("/home/user/.bashrc", "/home/user/.*"), true);
      assert.strictEqual(matchesGlob("/home/user/documents", "/home/user/.*"), false);
    });

    it("should handle Windows-style paths (pre-normalized)", () => {
      // paths are pre-normalized by normalizeFilePath before calling matchesGlob
      const windowsPath = normalizeFilePath("C:\\Users\\file.txt", testContext);
      assert.strictEqual(matchesGlob(windowsPath, "C:/Users/*.txt"), true);
    });
  });

  describe("checkPathPermission", () => {
    it("should return default action when no overrides match", () => {
      const permission: PermissionSection = {
        default: "ask",
        reason: "Default reason",
        overrides: [],
      };

      const result = checkPathPermission("/some/path", permission, testContext);
      assert.strictEqual(result.action, "ask");
      assert.strictEqual(result.reason, "Default reason");
    });

    it("should return matching override action", () => {
      const permission: PermissionSection = {
        default: "allow",
        overrides: [
          { path: ["/secret/**"], action: "deny", reason: "Secret area" },
        ],
      };

      const result = checkPathPermission("/secret/file.txt", permission, testContext);
      assert.strictEqual(result.action, "deny");
      assert.strictEqual(result.reason, "Secret area");
    });

    it("should use last matching override (last wins)", () => {
      const permission: PermissionSection = {
        default: "allow",
        overrides: [
          { path: ["/**"], action: "deny" },
          { path: ["/public/**"], action: "allow", reason: "Public area" },
        ],
      };

      const result = checkPathPermission("/public/file.txt", permission, testContext);
      assert.strictEqual(result.action, "allow");
      assert.strictEqual(result.reason, "Public area");
    });

    it("should match preprocessed patterns", () => {
      // Patterns are preprocessed at load time, so we use expanded patterns here
      const permission: PermissionSection = {
        default: "ask",
        overrides: [
          { path: ["/home/user/.ssh/**"], action: "deny", reason: "SSH keys" },
        ],
      };

      const result = checkPathPermission("/home/user/.ssh/id_rsa", permission, testContext);
      assert.strictEqual(result.action, "deny");
    });

    it("should match against multiple patterns in single override", () => {
      const permission: PermissionSection = {
        default: "allow",
        overrides: [
          { path: ["/a/**", "/b/**"], action: "deny" },
        ],
      };

      assert.strictEqual(checkPathPermission("/a/file", permission, testContext).action, "deny");
      assert.strictEqual(checkPathPermission("/b/file", permission, testContext).action, "deny");
      assert.strictEqual(checkPathPermission("/c/file", permission, testContext).action, "allow");
    });

    it("should include matchedPattern in result", () => {
      const permission: PermissionSection = {
        default: "allow",
        overrides: [
          { path: ["/test/**"], action: "ask", reason: "Test area" },
        ],
      };

      const result = checkPathPermission("/test/file.txt", permission, testContext);
      assert.strictEqual(result.matchedPattern, "/test/**");
    });
  });

  describe("checkRead", () => {
    it("should use permissions.read configuration", () => {
      const config = createEmptyConfig();
      config.permissions.read.default = "ask";
      config.permissions.read.overrides.push({
        path: ["/safe/**"],
        action: "allow",
      });

      const safeResult = checkRead("/safe/file.txt", config, testContext);
      assert.strictEqual(safeResult.action, "allow");

      const defaultResult = checkRead("/other/file.txt", config, testContext);
      assert.strictEqual(defaultResult.action, "ask");
    });
  });

  describe("checkWrite", () => {
    it("should use permissions.write configuration", () => {
      const config = createEmptyConfig();
      config.permissions.write.default = "ask";
      config.permissions.write.overrides.push({
        path: ["/project/**"],
        action: "allow",
      });

      const allowedResult = checkWrite("/project/file.txt", config, testContext);
      assert.strictEqual(allowedResult.action, "allow");

      const askResult = checkWrite("/outside/file.txt", config, testContext);
      assert.strictEqual(askResult.action, "ask");
    });
  });

  describe("checkDelete", () => {
    it("should use permissions.delete configuration", () => {
      const config = createEmptyConfig();
      config.permissions.delete.default = "ask";
      config.permissions.delete.overrides.push({
        path: ["/etc/**", "/usr/**", "/var/**"],
        action: "deny",
        reason: "System directories",
      });

      const denyResult = checkDelete("/etc/config", config, testContext);
      assert.strictEqual(denyResult.action, "deny");
      assert.strictEqual(denyResult.reason, "System directories");

      const askResult = checkDelete("/home/user/file", config, testContext);
      assert.strictEqual(askResult.action, "ask");
    });
  });

  describe("getDefaultContext", () => {
    it("should return context with system values", () => {
      const context = getDefaultContext();
      assert.strictEqual(context.cwd, process.cwd());
      assert.strictEqual(context.home, os.homedir());
      assert.strictEqual(context.tmpdir, os.tmpdir());
      // repo is auto-detected via git, or undefined if not in repo
      assert.ok(typeof context.repo === "string" || context.repo === undefined);
    });
  });
});
