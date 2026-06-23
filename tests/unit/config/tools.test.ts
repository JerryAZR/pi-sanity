import { describe, it } from "node:test";
import assert from "node:assert";
import { loadConfigFromString } from "../../../src/config-loader.js";
import { checkToolCall, buildToolDetails } from "../../../src/tool-checker.js";
import type { SanityConfig } from "../../../src/config-types.js";

function makeConfig(toolsToml: string, onWarning?: (msg: string) => void): SanityConfig {
  return loadConfigFromString(`
[permissions.read]
default = "allow"

[permissions.write]
default = "deny"

[commands]
default = "allow"

${toolsToml}
`, onWarning);
}

describe("tool rules config parsing", () => {
  it("should parse [[tools.rules]] with single name", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]
`);

    assert.ok(config.tools.rules.has("read"));
    assert.deepStrictEqual(config.tools.rules.get("read"), [
      { param: "path", check: "read" },
    ]);
  });

  it("should expand names array into shared checks", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["write", "edit"]
checks = [{ param = "path", check = "write" }]
`);

    assert.deepStrictEqual(config.tools.rules.get("write"), [
      { param: "path", check: "write" },
    ]);
    assert.deepStrictEqual(config.tools.rules.get("edit"), [
      { param: "path", check: "write" },
    ]);
  });

  it("should apply last-match-wins for duplicate tool names", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [{ param = "path", check = "read" }]

[[tools.rules]]
names = ["copy"]
checks = [
  { param = "source", check = "read" },
  { param = "destination", check = "write" },
]
`);

    assert.deepStrictEqual(config.tools.rules.get("copy"), [
      { param: "source", check: "read" },
      { param: "destination", check: "write" },
    ]);
  });

  it("should warn and skip invalid tool rules", () => {
    const warnings: string[] = [];
    const config = makeConfig(`
[[tools.rules]]
names = []
checks = [{ param = "path", check = "read" }]

[[tools.rules]]
names = ["bad"]
checks = [{ param = "path", check = "unknown" }]

[[tools.rules]]
names = ["empty-check"]
checks = []
`, (msg) => warnings.push(msg));

    assert.strictEqual(config.tools.rules.size, 0);
    assert.ok(warnings.some(w => w.includes("missing or invalid 'names'")), warnings.join("\n"));
    assert.ok(warnings.some(w => w.includes("unsupported check")), warnings.join("\n"));
    assert.ok(warnings.some(w => w.includes("missing or invalid 'checks'")), warnings.join("\n"));
  });

  it("should warn about empty string in tool names", () => {
    const warnings: string[] = [];
    const config = makeConfig(`
[[tools.rules]]
names = ["", "ok"]
checks = [{ param = "path", check = "read" }]
`, (msg) => warnings.push(msg));

    assert.strictEqual(config.tools.rules.size, 0);
    assert.ok(warnings.some(w => w.includes('"" is not allowed')), warnings.join("\n"));
  });

  it("should keep valid checks and drop invalid ones within a rule", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["mixed"]
checks = [
  { param = "path", check = "read" },
  { param = "", check = "write" },
  { param = "cmd", check = "bash" },
  { param = "bad", check = "invalid" },
]
`);

    assert.deepStrictEqual(config.tools.rules.get("mixed"), [
      { param: "path", check: "read" },
      { param: "cmd", check: "bash" },
    ]);
  });
});

describe("checkToolCall", () => {
  it("should return undefined for unlisted tools", () => {
    const config = makeConfig("");
    const result = checkToolCall("unknown", {}, config);
    assert.strictEqual(result, undefined);
  });

  it("should allow read of allowed files", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]
`);
    const result = checkToolCall("read", { path: "package.json" }, config);
    assert.strictEqual(result?.action, "allow");
  });

  it("should ask for read of sensitive files", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]

[[permissions.read.overrides]]
path = ["{{HOME}}/.ssh/*"]
action = "ask"
`);
    const result = checkToolCall("read", { path: "~/.ssh/id_rsa" }, config);
    assert.strictEqual(result?.action, "ask");
  });

  it("should deny write to protected locations", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["write"]
checks = [{ param = "path", check = "write" }]
`);
    const result = checkToolCall("write", { path: "/etc/passwd" }, config);
    assert.strictEqual(result?.action, "deny");
  });

  it("should pass through when required param is missing", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]
`);
    const result = checkToolCall("read", {}, config);
    assert.strictEqual(result?.action, "allow");
  });

  it("should aggregate multiple checks with deny winning", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [
  { param = "src", check = "read" },
  { param = "dst", check = "write" },
]
`);
    const result = checkToolCall("copy", { src: "package.json", dst: "/etc/passwd" }, config);
    assert.strictEqual(result?.action, "deny");
  });

  it("should aggregate array-valued parameters", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["delete_many"]
checks = [{ param = "paths", check = "write" }]
`);
    const result = checkToolCall("delete_many", { paths: ["package.json", "/etc/passwd"] }, config);
    assert.strictEqual(result?.action, "deny");
  });

  it("should ignore non-string values in arrays", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["mixed"]
checks = [{ param = "paths", check = "read" }]
`);
    const result = checkToolCall("mixed", { paths: ["package.json", 123, null] }, config);
    assert.strictEqual(result?.action, "allow");
  });

  it("should ignore empty strings", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]
`);
    const result = checkToolCall("read", { path: "" }, config);
    assert.strictEqual(result?.action, "allow");
  });

  it("should aggregate reasons from multiple checks", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [
  { param = "src", check = "read" },
  { param = "dst", check = "write" },
]

[[permissions.read.overrides]]
path = ["{{HOME}}/.ssh/*"]
action = "ask"
reason = "May contain credentials or secrets"

[[permissions.write.overrides]]
path = ["{{HOME}}/**"]
action = "ask"
reason = "Writing to home directory requires confirmation"
`);
    const result = checkToolCall("copy", { src: "~/.ssh/id_rsa", dst: "~/.bashrc" }, config);
    assert.strictEqual(result?.action, "ask");
    assert.ok(result?.reason?.includes("credentials"), result?.reason);
    assert.ok(result?.reason?.includes("home directory"), result?.reason);
  });
  it("should aggregate mixed actions with deny winning", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [
  { param = "src", check = "read" },
  { param = "dst", check = "write" },
]

[[permissions.read.overrides]]
path = ["{{HOME}}/.ssh/*"]
action = "ask"
reason = "May contain credentials or secrets"
`, (msg) => {});
    const result = checkToolCall("copy", { src: "~/.ssh/id_rsa", dst: "/etc/passwd" }, config);
    assert.strictEqual(result?.action, "deny");
    assert.ok(result?.reason?.includes("credentials"), result?.reason);
  });

  it("should allow safe bash commands", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["bash"]
checks = [{ param = "command", check = "bash" }]
`);
    const result = checkToolCall("bash", { command: "ls -la" }, config);
    assert.strictEqual(result?.action, "allow");
  });

  it("should check bash commands", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["bash"]
checks = [{ param = "command", check = "bash" }]

[[commands.rules]]
names = ["dd"]
action = "deny"
`);
    const result = checkToolCall("bash", { command: "dd if=/dev/zero of=/dev/sda" }, config);
    assert.strictEqual(result?.action, "deny");
  });
});

describe("buildToolDetails", () => {
  it("should return fallback for unknown tools", () => {
    const config = makeConfig("");
    const details = buildToolDetails("unknown", { path: "x" }, config);
    assert.strictEqual(details, "Tool: unknown");
  });

  it("should skip empty-string parameter values", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["read"]
checks = [{ param = "path", check = "read" }]
`);
    const details = buildToolDetails("read", { path: "" }, config);
    assert.ok(details.includes("Tool: read"));
    assert.ok(!details.includes("path"), details);
  });

  it("should describe checked parameters", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [
  { param = "src", check = "read" },
  { param = "dst", check = "write" },
]
`);
    const details = buildToolDetails("copy", { src: "a.txt", dst: "b.txt" }, config);
    assert.ok(details.includes("Tool: copy"));
    assert.ok(details.includes("src (read): a.txt"));
    assert.ok(details.includes("dst (write): b.txt"));
  });

  it("should group multiple checks on the same parameter", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["move"]
checks = [
  { param = "path", check = "read" },
  { param = "path", check = "write" },
]
`);
    const details = buildToolDetails("move", { path: "a.txt" }, config);
    assert.ok(details.includes("path (read, write): a.txt"), details);
  });

  it("should skip missing parameters in details", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["copy"]
checks = [
  { param = "src", check = "read" },
  { param = "dst", check = "write" },
]
`);
    const details = buildToolDetails("copy", { src: "a.txt" }, config);
    assert.ok(details.includes("src (read): a.txt"));
    assert.ok(!details.includes("dst"));
  });

  it("should handle array values in details", () => {
    const config = makeConfig(`
[[tools.rules]]
names = ["multi"]
checks = [{ param = "paths", check = "read" }]
`);
    const details = buildToolDetails("multi", { paths: ["a.txt", "b.txt"] }, config);
    assert.ok(details.includes("paths (read): a.txt, b.txt"));
  });
});
