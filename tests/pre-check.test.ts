import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseMatchPattern,
  matchesPattern,
  evaluatePreCheck,
  evaluatePreChecks,
} from "../src/pre-check.js";

// ============================================================================
// Test Helper
// ============================================================================

interface TestCase {
  pattern: string;
  input: string;
  expect: boolean;
  desc?: string;
}

function TEST(pattern: string, input: string, expect: boolean, desc?: string): TestCase {
  return { pattern, input, expect, desc };
}

function runMatchTests(description: string, tests: TestCase[]) {
  describe(description, () => {
    for (const t of tests) {
      const testDesc = t.desc || `matchesPattern("${t.input}", "${t.pattern}")`;
      it(testDesc, () => {
        const result = matchesPattern(t.input, t.pattern);
        assert.strictEqual(
          result,
          t.expect,
          `Expected ${t.expect} but got ${result} for pattern="${t.pattern}" input="${t.input}"`,
        );
      });
    }
  });
}

// ============================================================================
// parseMatchPattern - Structure Tests
// ============================================================================

describe("parseMatchPattern", () => {
  it("should parse exact match pattern", () => {
    const result = parseMatchPattern("root");
    assert.deepStrictEqual(result, { type: "exact", negated: false, pattern: "root" });
  });

  it("should parse glob pattern", () => {
    const result = parseMatchPattern("glob:**/project/*");
    assert.deepStrictEqual(result, { type: "glob", negated: false, pattern: "**/project/*" });
  });

  it("should parse regex pattern", () => {
    const result = parseMatchPattern("re:^/dev");
    assert.deepStrictEqual(result, { type: "regex", negated: false, pattern: "^/dev" });
  });

  it("should parse optional colon prefix :pattern", () => {
    const result = parseMatchPattern(":root");
    assert.deepStrictEqual(result, { type: "exact", negated: false, pattern: "root" });
  });

  it("should parse escaped colon ::pattern", () => {
    const result = parseMatchPattern("::root");
    assert.deepStrictEqual(result, { type: "exact", negated: false, pattern: ":root" });
  });

  it("should parse literal exclamation !pattern", () => {
    const result = parseMatchPattern("!root");
    assert.deepStrictEqual(result, { type: "exact", negated: false, pattern: "!root" });
  });

  it("should parse negated exact !:pattern", () => {
    const result = parseMatchPattern("!:root");
    assert.deepStrictEqual(result, { type: "exact", negated: true, pattern: "root" });
  });

  it("should parse negated glob !glob:pattern", () => {
    const result = parseMatchPattern("!glob:*/prod/*");
    assert.deepStrictEqual(result, { type: "glob", negated: true, pattern: "*/prod/*" });
  });

  it("should parse negated regex !re:pattern", () => {
    const result = parseMatchPattern("!re:^/etc");
    assert.deepStrictEqual(result, { type: "regex", negated: true, pattern: "^/etc" });
  });
});

// ============================================================================
// matchesPattern - Edge Cases
// ============================================================================

describe("matchesPattern edge cases", () => {
  describe("empty patterns", () => {
    runMatchTests("empty exact match", [
      TEST("", "", true, "empty matches empty"),
      TEST("", "value", false, "empty does not match non-empty"),
    ]);
  });

  describe("just exclamation", () => {
    runMatchTests("single exclamation mark", [
      TEST("!", "!", true, "literal ! matches itself (no colon = exact)"),
      TEST("!", "", false, "literal ! does not match empty"),
      TEST("!:", "x", true, "negated empty matches non-empty"),
      TEST("!:", "", false, "negated empty does NOT match empty"),
    ]);
  });

  describe("colons", () => {
    runMatchTests("colon edge cases", [
      TEST(":", "", true, ": alone matches empty"),
      TEST("::", ":", true, ":: matches literal :"),
      TEST(":::", "::", true, "::: matches ::"),
      TEST(":test", "test", true, ":test matches test"),
      TEST("::test", ":test", true, "::test matches :test"),
    ]);
  });

  describe("literal exclamation in pattern", () => {
    runMatchTests("literal ! patterns", [
      TEST("!value", "!value", true, "literal !value matches itself"),
      TEST("!value", "value", false, "literal !value does not match value"),
      TEST("!!value", "!!value", true, "double exclamation literal"),
      TEST("!:", "!:", true, "literal !: is different from negated empty"),
    ]);
  });

  describe("negation edge cases", () => {
    runMatchTests("negation behaviors", [
      TEST("!:", "x", true, "NOT empty matches non-empty"),
      TEST("!:", "", false, "NOT empty does NOT match empty"),
      TEST("!:*", "**", true, "NOT * matches anything but literal *"),
      TEST("!:*", "abc", true, "NOT * matches abc"),
      TEST("!:*", "*", false, "NOT * does not match literal *"),
    ]);
  });

  describe("ambiguous patterns", () => {
    runMatchTests("ambiguous but valid", [
      TEST("glob", "glob", true, "literal glob matches itself (not glob type - no colon)"),
      TEST("!glob", "!glob", true, "literal !glob matches itself (no colon)"),
      TEST("re", "re", true, "literal re matches itself (no colon)"),
      TEST("!re", "!re", true, "literal !re matches itself (no colon)"),
      // glob: and !glob: have colons, so they're typed patterns (not literal)
      // Empty pattern behavior is implementation-defined
    ]);
  });

  describe("overlapping prefixes", () => {
    runMatchTests("tricky prefixes", [
      TEST("::glob:*", ":glob:*", true, "escaped colon + glob literal"),
      TEST(":glob:*", "glob:*", true, "optional colon + glob literal"),
      TEST("glob:*", "file.txt", true, "actual glob pattern"),
      TEST("!!:test", "!!:test", true, "literal !!:test (double exclamation)"),
      TEST("!:!:test", "!:!:test", true, "literal !:!:test (complex)"),
      TEST("!:!:test", "!:test", false, "NOT !:test (complex)"),
    ]);
  });
});

// ============================================================================
// Standard Functionality Tests (using TEST helper)
// ============================================================================

describe("matchesPattern - exact matching", () => {
  runMatchTests("exact matches", [
    TEST("root", "root", true),
    TEST("root", "admin", false),
    TEST("", "", true),
    TEST("", "value", false),
    TEST(":root", "root", true, "optional colon works"),
    TEST("::root", ":root", true, "escaped colon works"),
    TEST("!root", "!root", true, "literal exclamation works"),
    TEST("!:root", "root", false, "negation works - does not match"),
    TEST("!:root", "admin", true, "negation works - matches other"),
  ]);
});

describe("matchesPattern - glob matching", () => {
  runMatchTests("basic globs", [
    TEST("glob:*.txt", "file.txt", true),
    TEST("glob:*.txt", "file.log", false),
    TEST("glob:**/src", "/home/user/project/src", true),
    TEST("glob:**/src", "/home/user/project", false),
  ]);

  runMatchTests("negated globs", [
    TEST("!glob:*.log", "file.txt", true, "NOT *.log matches txt"),
    TEST("!glob:*.log", "file.log", false, "NOT *.log does not match log"),
  ]);
});

describe("matchesPattern - regex matching", () => {
  runMatchTests("basic regex", [
    TEST("re:^test", "test123", true),
    TEST("re:^test", "mytest", false),
    TEST("re:^/dev", "/dev/sda1", true),
    TEST("re:^/dev", "/sys/dev", false),
  ]);

  runMatchTests("negated regex", [
    TEST("!re:^/etc", "/home/user", true, "NOT ^/etc matches /home"),
    TEST("!re:^/etc", "/etc/passwd", false, "NOT ^/etc does not match /etc"),
  ]);
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("evaluatePreCheck", () => {
  it("should return matched=true when pattern matches", () => {
    const result = evaluatePreCheck("USER", "root", "root", "deny", "Don't run as root");
    assert.deepStrictEqual(result, {
      matched: true,
      action: "deny",
      reason: "Don't run as root",
    });
  });

  it("should return matched=false when pattern does not match", () => {
    const result = evaluatePreCheck("USER", "root", "admin", "deny", "Don't run as root");
    assert.deepStrictEqual(result, {
      matched: false,
      action: "deny",
      reason: "Don't run as root",
    });
  });

  it("should treat undefined env as empty string", () => {
    const result = evaluatePreCheck("UNDEFINED_VAR", "", undefined, "allow");
    assert.strictEqual(result.matched, true);
  });

  it("should treat empty env var as matching empty pattern", () => {
    const result = evaluatePreCheck("EMPTY_VAR", "", "", "ask");
    assert.strictEqual(result.matched, true);
  });

  it("should handle negated patterns", () => {
    const result = evaluatePreCheck("ENV", "!:prod", "dev", "deny", "Not in prod");
    assert.strictEqual(result.matched, true);
  });

  it("should not match negated pattern when value matches", () => {
    const result = evaluatePreCheck("ENV", "!:prod", "prod", "deny", "Not in prod");
    assert.strictEqual(result.matched, false);
  });
});

describe("evaluatePreChecks (multiple)", () => {
  it("should return undefined when no checks provided", () => {
    const result = evaluatePreChecks([]);
    assert.strictEqual(result, undefined);
  });

  it("should return undefined when no checks match", () => {
    process.env.TEST_NO_MATCH = "admin";
    const checks = [{ env: "TEST_NO_MATCH", match: "root", action: "deny" as const }];
    const result = evaluatePreChecks(checks);
    delete process.env.TEST_NO_MATCH;
    assert.strictEqual(result, undefined);
  });

  it("should return strictest action (deny > ask > allow)", () => {
    process.env.TEST_MULTI = "value";
    const checks = [
      { env: "TEST_MULTI", match: "value", action: "allow" as const },
      { env: "TEST_MULTI", match: "value", action: "ask" as const },
      { env: "TEST_MULTI", match: "value", action: "deny" as const },
    ];
    const result = evaluatePreChecks(checks);
    delete process.env.TEST_MULTI;
    assert.strictEqual(result?.action, "deny");
  });

  it("should collect reasons from matching checks", () => {
    process.env.TEST_REASONS = "x";
    process.env.TEST_REASONS2 = "y";
    const checks = [
      { env: "TEST_REASONS", match: "x", action: "ask" as const, reason: "Reason 1" },
      { env: "TEST_REASONS2", match: "y", action: "ask" as const, reason: "Reason 2" },
    ];
    const result = evaluatePreChecks(checks);
    delete process.env.TEST_REASONS;
    delete process.env.TEST_REASONS2;
    assert.deepStrictEqual(result?.reasons, ["Reason 1", "Reason 2"]);
  });
});
