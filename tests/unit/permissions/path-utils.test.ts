import { describe, it } from "node:test";
import assert from "node:assert";
import picomatch from "picomatch";
import {
  preprocessConfigPattern,
  type PathContext,
} from "../../../src/path-utils.js";

const testContext: PathContext = {
  cwd: "/project",
  home: "/home/user",
  repo: "/project",
  tmpdir: "/tmp",
};

describe("preprocessConfigPattern", () => {
  it("should return simple pattern unchanged", () => {
    const result = preprocessConfigPattern("/simple/path", testContext);
    assert.strictEqual(result, "/simple/path");
  });

  it("should expand {{HOME}} variable", () => {
    const result = preprocessConfigPattern("{{HOME}}/.ssh/**", testContext);
    assert.strictEqual(result, "/home/user/.ssh/**");
  });

  it("should expand {{CWD}} variable", () => {
    const result = preprocessConfigPattern("{{CWD}}/file.txt", testContext);
    assert.strictEqual(result, "/project/file.txt");
  });

  it("should expand {{REPO}} variable", () => {
    const result = preprocessConfigPattern("{{REPO}}/src/**", testContext);
    assert.strictEqual(result, "/project/src/**");
  });

  it("should expand {{TMPDIR}} variable", () => {
    const result = preprocessConfigPattern("{{TMPDIR}}/temp/**", testContext);
    assert.strictEqual(result, "/tmp/temp/**");
  });

  it("should expand environment variables", () => {
    process.env.TEST_VAR = "/test/value";
    const result = preprocessConfigPattern("$TEST_VAR/file", testContext);
    delete process.env.TEST_VAR;
    assert.strictEqual(result, "/test/value/file");
  });

  it("should use literal string if env var not set", () => {
    const result = preprocessConfigPattern("$UNDEFINED/file", testContext);
    // Falls back to literal if env var not set
    assert.ok(result.includes("UNDEFINED") || result === "/file");
  });

  it("should strip Windows drive letters", () => {
    const result = preprocessConfigPattern("C:\\Users\\file", testContext);
    assert.strictEqual(result, "/Users/file");
  });

  it("should normalize trailing slashes", () => {
    const result = preprocessConfigPattern("/home/user/", testContext);
    assert.strictEqual(result, "/home/user");
  });

  it("should handle context.repo = undefined", () => {
    const ctx = { ...testContext, repo: undefined };
    const result = preprocessConfigPattern("{{REPO}}/file", ctx);
    // Should not throw, uses pattern as-is or empty string
    assert.ok(typeof result === "string");
  });
});

describe("expanded patterns work with picomatch", () => {
  it("should match paths using expanded patterns", () => {
    const pattern = preprocessConfigPattern("{{CWD}}/**", testContext);
    assert.strictEqual(picomatch.isMatch("/project/file.txt", pattern), true);
    assert.strictEqual(picomatch.isMatch("/other/file.txt", pattern), false);
  });

  it("should match .git paths with expanded patterns", () => {
    const pattern = preprocessConfigPattern("{{REPO}}/**/.git/**", testContext);
    assert.strictEqual(picomatch.isMatch("/project/.git/config", pattern), true);
    assert.strictEqual(picomatch.isMatch("/project/submodule/.git/HEAD", pattern), true);
    assert.strictEqual(picomatch.isMatch("/other/.git/config", pattern), false);
  });
});
