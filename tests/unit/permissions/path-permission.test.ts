import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import {
  checkPathPermission,
  checkRead,
  checkWrite,
  checkDelete,
  getDefaultContext,
  type PathContext,
} from "../../../src/path-permission.js";
import { createEmptyConfig } from "../../../src/config-types.js";
import type { PermissionSection } from "../../../src/config-types.js";

const testContext: PathContext = {
  cwd: "/project",
  home: "/home/user",
  repo: "/project",
  tmpdir: "/tmp",
};

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

  it("should match glob wildcards (*, ?, **)", () => {
    const permission: PermissionSection = {
      default: "allow",
      overrides: [
        { path: ["**/*.txt"], action: "ask", reason: "Text files anywhere" },
        { path: ["/project/file?.log"], action: "deny", reason: "Log files" },
        { path: ["/deep/**/*.js"], action: "ask", reason: "JS files anywhere" },
      ],
    };

    // * wildcard with **/
    assert.strictEqual(checkPathPermission("/project/readme.txt", permission, testContext).action, "ask");
    assert.strictEqual(checkPathPermission("/project/readme.md", permission, testContext).action, "allow");

    // ? wildcard  
    assert.strictEqual(checkPathPermission("/project/file1.log", permission, testContext).action, "deny");
    assert.strictEqual(checkPathPermission("/project/file12.log", permission, testContext).action, "allow");

    // ** wildcard
    assert.strictEqual(checkPathPermission("/deep/a/b/c/test.js", permission, testContext).action, "ask");
    assert.strictEqual(checkPathPermission("/deep/test.js", permission, testContext).action, "ask");
    assert.strictEqual(checkPathPermission("/deep/a/b/c/test.ts", permission, testContext).action, "allow");
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

  it("should allow read when config allows", () => {
    const config = createEmptyConfig();
    config.permissions.read.default = "allow";

    const result = checkRead("/any/path", config, testContext);
    assert.strictEqual(result.action, "allow");
  });

  it("should deny read when config denies", () => {
    const config = createEmptyConfig();
    config.permissions.read.default = "deny";
    config.permissions.read.reason = "Reads are denied";

    const result = checkRead("/secret/file", config, testContext);
    assert.strictEqual(result.action, "deny");
    assert.strictEqual(result.reason, "Reads are denied");
  });

  it("should ask when config asks", () => {
    const config = createEmptyConfig();
    config.permissions.read.default = "ask";
    config.permissions.read.reason = "Please confirm read";

    const result = checkRead("/some/path", config, testContext);
    assert.strictEqual(result.action, "ask");
    assert.strictEqual(result.reason, "Please confirm read");
  });

  it("should respect override rules (last match wins)", () => {
    const config = createEmptyConfig();
    config.permissions.read.default = "deny";
    config.permissions.read.overrides.push(
      { path: ["/public/**"], action: "allow" },
      { path: ["/public/secret/**"], action: "deny" }
    );

    // Public path - allowed
    let result = checkRead("/public/file.txt", config, testContext);
    assert.strictEqual(result.action, "allow");

    // Secret in public - denied (later override wins)
    result = checkRead("/public/secret/file.txt", config, testContext);
    assert.strictEqual(result.action, "deny");

    // Other path - denied (default)
    result = checkRead("/private/file.txt", config, testContext);
    assert.strictEqual(result.action, "deny");
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

  it("should deny write when config denies", () => {
    const config = createEmptyConfig();
    config.permissions.write.default = "deny";
    config.permissions.write.reason = "Writes are denied";

    const result = checkWrite("/etc/passwd", config, testContext);
    assert.strictEqual(result.action, "deny");
    assert.strictEqual(result.reason, "Writes are denied");
  });

  it("should protect system directories", () => {
    const config = createEmptyConfig();
    config.permissions.write.default = "allow";
    config.permissions.write.overrides.push(
      { path: ["/etc/**", "/usr/**", "/bin/**"], action: "deny", reason: "System directories are protected" }
    );

    assert.strictEqual(checkWrite("/etc/config", config, testContext).action, "deny");
    assert.strictEqual(checkWrite("/usr/bin/app", config, testContext).action, "deny");
    assert.strictEqual(checkWrite("/bin/ls", config, testContext).action, "deny");
    assert.strictEqual(checkWrite("/home/user/file", config, testContext).action, "allow");
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
