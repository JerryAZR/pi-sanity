import { describe, it } from "node:test";
import assert from "node:assert";
import { parseArgs } from "../../../src/arg-parser.js";
import type { RuleConfig } from "../../../src/config-types.js";

function makeConfig(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return {
    ...overrides,
  };
}

describe("arg-parser", () => {
  describe("flag detection", () => {
    it("should detect standalone short flag", () => {
      const config = makeConfig({ flags: [{ flag: "-f", action: "deny" }] });
      const result = parseArgs(["-f"], config, new Set());
      assert.ok(result.flags.has("-f"));
      assert.strictEqual(result.positionals.length, 0);
    });

    it("should detect standalone long flag", () => {
      const config = makeConfig({ flags: [{ flag: "--force", action: "deny" }] });
      const result = parseArgs(["--force"], config, new Set());
      assert.ok(result.flags.has("--force"));
    });

    it("should detect short flag inside combined string", () => {
      const config = makeConfig({ flags: [{ flag: "-f", action: "deny" }] });
      const result = parseArgs(["-rf"], config, new Set());
      assert.ok(result.flags.has("-f"));
    });

    it("should detect multiple flags in combined string", () => {
      const config = makeConfig({
        flags: [
          { flag: "-r", action: "ask" },
          { flag: "-f", action: "deny" },
        ],
      });
      const result = parseArgs(["-rf"], config, new Set());
      assert.ok(result.flags.has("-r"));
      assert.ok(result.flags.has("-f"));
    });

    it("should NOT decompose declared multi-char flag", () => {
      const config = makeConfig({
        flags: [
          { flag: "-Wall", action: "ask" },
          { flag: "-W", action: "deny" },
        ],
      });
      const result = parseArgs(["-Wall"], config, new Set());
      assert.ok(result.flags.has("-Wall"));
      assert.ok(!result.flags.has("-W"));
    });

    it("should decompose undeclared multi-char flag for single-char match", () => {
      const config = makeConfig({ flags: [{ flag: "-W", action: "deny" }] });
      const result = parseArgs(["-Wall"], config, new Set());
      assert.ok(result.flags.has("-W"));
      assert.ok(!result.flags.has("-Wall"));
    });
  });

  describe("option detection", () => {
    it("should extract option with space separator", () => {
      const config = makeConfig({ options: { "-o": ["write"] } });
      const result = parseArgs(["-o", "/specific"], config, new Set());
      assert.strictEqual(result.options.get("-o")?.value, "/specific");
      assert.strictEqual(result.options.get("-o")?.originalIndex, 1);
      assert.strictEqual(result.positionals.length, 0);
    });

    it("should extract option with equals separator", () => {
      const config = makeConfig({ options: { "-o": ["write"] } });
      const result = parseArgs(["-o=/specific"], config, new Set());
      assert.strictEqual(result.options.get("-o")?.value, "/specific");
      assert.strictEqual(result.options.get("-o")?.originalIndex, 0);
    });

    it("should extract long option with equals separator", () => {
      const config = makeConfig({ options: { "--target-directory": ["write"] } });
      const result = parseArgs(["--target-directory=/foo"], config, new Set());
      assert.strictEqual(result.options.get("--target-directory")?.value, "/foo");
      assert.strictEqual(result.options.get("--target-directory")?.originalIndex, 0);
    });

    it("should consume option value and not count as positional", () => {
      const config = makeConfig({
        options: { "-o": ["write"] },
        positionals: { default_perm: ["read"] },
      });
      const result = parseArgs(["-o", "/opt", "/pos"], config, new Set());
      assert.strictEqual(result.options.get("-o")?.value, "/opt");
      assert.strictEqual(result.options.get("-o")?.originalIndex, 1);
      assert.strictEqual(result.positionals.length, 1);
      assert.strictEqual(result.positionals[0].value, "/pos");
      assert.strictEqual(result.positionals[0].originalIndex, 2);
    });
  });

  describe("flag vs option interaction", () => {
    it("should treat -fo as option when -fo is declared option, NOT flag -f", () => {
      // BUG FIX: -f is a flag, -fo is an option. Command "cmd -fo test.txt"
      // should NOT have flag -f set (because -fo is consumed as option).
      const config = makeConfig({
        flags: [{ flag: "-f", action: "deny" }],
        options: { "-fo": ["write"] },
      });
      const result = parseArgs(["-fo", "test.txt"], config, new Set());

      // -fo is the option, not -f flag
      assert.ok(!result.flags.has("-f"), "flag -f should NOT be set when -fo is option");
      assert.strictEqual(result.options.get("-fo")?.value, "test.txt");
      assert.strictEqual(result.options.get("-fo")?.originalIndex, 1);
      assert.strictEqual(result.positionals.length, 0);
    });

    it("should treat -fo as flag -f when -fo is NOT declared option", () => {
      const config = makeConfig({
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = parseArgs(["-fo", "test.txt"], config, new Set());

      // -fo is not declared option, so decomposed: -f flag + unknown -o
      assert.ok(result.flags.has("-f"), "flag -f should be found via decomposition");
      assert.ok(!result.options.has("-fo"));
      // "test.txt" is a positional (not consumed as option value)
      assert.strictEqual(result.positionals.length, 1);
      assert.strictEqual(result.positionals[0].value, "test.txt");
    });
  });

  describe("combined short string with option", () => {
    it("should detect option in combined string and consume next arg", () => {
      const config = makeConfig({
        flags: [{ flag: "-x", action: "allow" }],
        options: { "-f": ["read"] },
      });
      const result = parseArgs(["-xzf", "/specific"], config, new Set());
      assert.ok(result.flags.has("-x"));
      assert.strictEqual(result.options.get("-f")?.value, "/specific");
      assert.strictEqual(result.options.get("-f")?.originalIndex, 1);
      assert.strictEqual(result.positionals.length, 0);
    });

    it("should consume option from -xf combined string", () => {
      const config = makeConfig({
        flags: [{ flag: "-x", action: "allow" }],
        options: { "-f": ["write"] },
      });
      const result = parseArgs(["-xf", "/specific"], config, new Set());
      assert.ok(result.flags.has("-x"));
      assert.strictEqual(result.options.get("-f")?.value, "/specific");
      assert.strictEqual(result.options.get("-f")?.originalIndex, 1);
    });
  });

  describe("positional counting", () => {
    it("should skip declared flags from positional counting", () => {
      const config = makeConfig({
        positionals: { default_perm: ["read"] },
        flags: [{ flag: "--force", action: "allow" }],
      });
      const result = parseArgs(["--force", "/pos0"], config, new Set());
      assert.strictEqual(result.positionals.length, 1);
      assert.strictEqual(result.positionals[0].value, "/pos0");
      assert.strictEqual(result.positionals[0].originalIndex, 1);
    });

    it("should count positionals correctly with flags mixed in", () => {
      const config = makeConfig({
        positionals: { default_perm: ["read"] },
      });
      const result = parseArgs(["-r", "/src", "/dest"], config, new Set());
      assert.strictEqual(result.positionals.length, 2);
      assert.strictEqual(result.positionals[0].value, "/src");
      assert.strictEqual(result.positionals[1].value, "/dest");
    });
  });

  describe("dynamic args", () => {
    it("should preserve dynamic arg in positional list but track original index", () => {
      const config = makeConfig({
        positionals: { default_perm: ["read"] },
      });
      const result = parseArgs(["$(echo src)", "dest"], config, new Set([0]));
      assert.strictEqual(result.positionals.length, 2);
      assert.strictEqual(result.positionals[0].value, "$(echo src)");
      assert.strictEqual(result.positionals[0].originalIndex, 0);
      assert.strictEqual(result.positionals[1].value, "dest");
      assert.strictEqual(result.positionals[1].originalIndex, 1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty args", () => {
      const config = makeConfig({ flags: [{ flag: "-f", action: "deny" }] });
      const result = parseArgs([], config, new Set());
      assert.strictEqual(result.flags.size, 0);
      assert.strictEqual(result.positionals.length, 0);
    });

    it("should handle no config", () => {
      const result = parseArgs(["-f", "file.txt"], undefined, new Set());
      assert.strictEqual(result.flags.size, 0);
      // Without config, unknown option-like tokens (-f) are skipped;
      // only non-dash args are positionals
      assert.strictEqual(result.positionals.length, 1);
      assert.strictEqual(result.positionals[0].value, "file.txt");
    });

    it("should skip unknown options", () => {
      const config = makeConfig({
        positionals: { default_perm: ["read"] },
      });
      const result = parseArgs(["--unknown", "/pos"], config, new Set());
      assert.strictEqual(result.positionals.length, 1);
      assert.strictEqual(result.positionals[0].value, "/pos");
    });

    it("should treat everything after -- as positional", () => {
      const config = makeConfig({
        flags: [{ flag: "-f", action: "deny" }],
        positionals: { default_perm: ["read"] },
      });
      // Note: parseArgs receives cmd.args (without command name), so we test
      // the args portion only.
      const result = parseArgs(["--", "-f", "file.txt"], config, new Set());
      assert.ok(!result.flags.has("-f"), "-f after -- should NOT be detected as flag");
      assert.strictEqual(result.positionals.length, 2);
      assert.strictEqual(result.positionals[0].value, "-f");
      assert.strictEqual(result.positionals[1].value, "file.txt");
    });
  });
});
