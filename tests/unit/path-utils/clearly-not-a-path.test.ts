import { describe, it } from "node:test";
import assert from "node:assert";
import { clearlyNotAPath } from "../../../src/path-utils.js";

describe("clearlyNotAPath", () => {
  it("should always return false (function is disabled)", () => {
    // Function is disabled to prevent security bypasses
    assert.strictEqual(clearlyNotAPath(""), false);
    assert.strictEqual(clearlyNotAPath("any string"), false);
    assert.strictEqual(clearlyNotAPath("*.txt"), false);
    assert.strictEqual(clearlyNotAPath("file#1"), false);
    assert.strictEqual(clearlyNotAPath("path\0with\0nulls"), false);
    assert.strictEqual(clearlyNotAPath("path>file"), false);
    assert.strictEqual(clearlyNotAPath("path|file"), false);
  });

  it("should accept all glob patterns", () => {
    const globs = [
      "*.txt",
      "**/*.js",
      "file?.txt",
      "[abc].txt",
      "src/**/*.ts",
      "*",
      "**",
      "???",
      "[a-z]",
      "!(exclude)",
      "@(pattern)",
      "+(pattern)",
    ];

    for (const pattern of globs) {
      assert.strictEqual(clearlyNotAPath(pattern), false, `Should accept: ${pattern}`);
    }
  });

  it("should accept all valid paths", () => {
    const paths = [
      "/home/user/file.txt",
      "./relative/path",
      "../parent/file",
      "file.txt",
      "file#1.txt",
      "file@2.txt",
      "path with spaces",
      "file-name",
      "file_name",
      "file+name",
      "{{HOME}}/.ssh/**",
      "$HOME/file",
      "~/.bashrc",
      "http://example.com",
      "https://site.org/path",
      "",
    ];

    for (const path of paths) {
      assert.strictEqual(clearlyNotAPath(path), false, `Should accept: ${path}`);
    }
  });
});
