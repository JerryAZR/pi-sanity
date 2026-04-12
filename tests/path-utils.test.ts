import { describe, it } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import * as os from "node:os";
import {
  expandTilde,
  expandBraces,
  expandEnvVars,
  preprocessPath,
  preprocessConfigPattern,
  preprocessRuntimePath,
  type PathContext,
} from "../src/path-utils.js";

describe("path-utils (preprocessor)", () => {
  const testContext: PathContext = {
    cwd: "/project",
    home: "/home/user",
    repo: "/repo",
    tmpdir: "/tmp",
  };

  describe("expandTilde", () => {
    it("should expand ~/ to home directory", () => {
      const result = expandTilde("~/documents", testContext.home);
      // Just verify the tilde is replaced and path follows home
      assert.ok(result.startsWith(testContext.home));
      assert.ok(result.endsWith("documents"));
      assert.ok(!result.includes("~"));
    });

    it("should expand ~\\ to home directory (Windows style)", () => {
      const result = expandTilde("~\\documents", "C:\\Users\\user");
      assert.strictEqual(result, "C:\\Users\\user\\documents");
    });

    it("should expand ~ to home directory", () => {
      const result = expandTilde("~", testContext.home);
      assert.strictEqual(result, testContext.home);
    });

    it("should not modify paths without tilde", () => {
      assert.strictEqual(expandTilde("/etc/passwd", testContext.home), "/etc/passwd");
      assert.strictEqual(expandTilde("./relative", testContext.home), "./relative");
    });

    it("should not expand ~ in middle of path", () => {
      assert.strictEqual(expandTilde("/tmp/~", testContext.home), "/tmp/~");
      assert.strictEqual(expandTilde("prefix~suffix", testContext.home), "prefix~suffix");
    });

    it("should not expand ~username (other users)", () => {
      assert.strictEqual(expandTilde("~root", testContext.home), "~root");
      assert.strictEqual(expandTilde("~other/file", testContext.home), "~other/file");
    });
  });

  describe("expandBraces", () => {
    it("should expand {{HOME}}", () => {
      const result = expandBraces("{{HOME}}/.ssh", testContext);
      assert.strictEqual(result, "/home/user/.ssh");
    });

    it("should expand {{CWD}}", () => {
      const result = expandBraces("{{CWD}}/file.txt", testContext);
      assert.strictEqual(result, "/project/file.txt");
    });

    it("should expand {{REPO}}", () => {
      const result = expandBraces("{{REPO}}/src", testContext);
      assert.strictEqual(result, "/repo/src");
    });

    it("should expand {{TMPDIR}}", () => {
      const result = expandBraces("{{TMPDIR}}/cache", testContext);
      assert.strictEqual(result, "/tmp/cache");
    });

    it("should expand multiple variables", () => {
      const result = expandBraces("{{HOME}}/{{CWD}}/file", testContext);
      // Simple string replacement - may produce double slashes
      // Full normalization happens in preprocessPath
      assert.strictEqual(result, "/home/user//project/file");
    });

    it("should leave unknown {{VARS}} unchanged", () => {
      const result = expandBraces("{{UNKNOWN}}/file", testContext);
      assert.strictEqual(result, "{{UNKNOWN}}/file");
    });

    it("should fall back to CWD when REPO is undefined", () => {
      const contextWithoutRepo = { ...testContext, repo: undefined };
      const result = expandBraces("{{REPO}}/src", contextWithoutRepo);
      assert.strictEqual(result, "/project/src");
    });
  });

  describe("expandEnvVars", () => {
    it("should expand $ENV_VAR", () => {
      process.env.TEST_EXPAND_VAR = "/test/path";
      const result = expandEnvVars("$TEST_EXPAND_VAR/file");
      assert.strictEqual(result, "/test/path/file");
      delete process.env.TEST_EXPAND_VAR;
    });

    it("should expand multiple env vars", () => {
      process.env.TEST_VAR1 = "/a";
      process.env.TEST_VAR2 = "/b";
      const result = expandEnvVars("$TEST_VAR1$TEST_VAR2/file");
      assert.strictEqual(result, "/a/b/file");
      delete process.env.TEST_VAR1;
      delete process.env.TEST_VAR2;
    });

    it("should leave unknown $VARS unchanged", () => {
      const result = expandEnvVars("$UNKNOWN_VAR/file");
      assert.strictEqual(result, "$UNKNOWN_VAR/file");
    });

    it("should handle env vars with underscores", () => {
      process.env.TEST_UNDERSCORE_VAR = "/underscore";
      const result = expandEnvVars("$TEST_UNDERSCORE_VAR/path");
      assert.strictEqual(result, "/underscore/path");
      delete process.env.TEST_UNDERSCORE_VAR;
    });

    it("should handle env vars with numbers", () => {
      process.env.TEST_VAR123 = "/numbers";
      const result = expandEnvVars("$TEST_VAR123/path");
      assert.strictEqual(result, "/numbers/path");
      delete process.env.TEST_VAR123;
    });

    it("should not expand $ in middle of word", () => {
      const result = expandEnvVars("abc$def/ghi");
      assert.strictEqual(result, "abc$def/ghi");
    });
  });

  describe("preprocessConfigPattern (config pipeline)", () => {
    it("should apply all expansions in order", () => {
      process.env.TEST_PIPELINE = "data";
      const result = preprocessConfigPattern("~/$TEST_PIPELINE/{{CWD}}", testContext);
      // Result should have all expansions applied (forward slashes)
      assert.ok(result.includes("home") && result.includes("user"));
      assert.ok(result.includes("data"));
      assert.ok(result.includes("project"));
      delete process.env.TEST_PIPELINE;
    });

    it("should normalize to forward slashes", () => {
      const result = preprocessConfigPattern("~/folder\\file.txt", testContext);
      // Should normalize to forward slashes for cross-platform matching
      assert.ok(!result.includes("\\"));
    });

    it("should remove duplicate slashes", () => {
      const result = preprocessConfigPattern("{{HOME}}//file", testContext);
      assert.ok(!result.includes("//"));
    });

    it("should handle complex real-world config patterns", () => {
      process.env.PROJECT = "myapp";
      const pattern = "~/$PROJECT/{{CWD}}/config.toml";
      const result = preprocessConfigPattern(pattern, testContext);
      // Should have expanded all variables
      assert.ok(!result.includes("~"));
      assert.ok(!result.includes("$PROJECT"));
      assert.ok(!result.includes("{{CWD}}"));
      delete process.env.PROJECT;
    });

    it("should handle pattern without any variables", () => {
      const result = preprocessConfigPattern("/etc/passwd", testContext);
      assert.ok(result.includes("etc") && result.includes("passwd"));
    });
  });

  describe("preprocessRuntimePath (runtime pipeline)", () => {
    it("should expand tilde and env vars but not braces", () => {
      process.env.TEST_RUNTIME = "data";
      const result = preprocessRuntimePath("~/$TEST_RUNTIME/{{CWD}}", testContext);
      // Tilde and env var expanded, braces NOT expanded (user input shouldn't have them)
      assert.ok(result.includes("home") && result.includes("user"));
      assert.ok(result.includes("data"));
      assert.ok(result.includes("{{CWD}}")); // Braces preserved
      delete process.env.TEST_RUNTIME;
    });

    it("should resolve relative paths", () => {
      const result = preprocessRuntimePath("file.txt", testContext);
      assert.ok(result.includes("/project/"));
      assert.ok(result.includes("file.txt"));
    });

    it("should normalize to forward slashes", () => {
      const result = preprocessRuntimePath("~/folder\\file.txt", testContext);
      assert.ok(!result.includes("\\"));
    });
  });
});
