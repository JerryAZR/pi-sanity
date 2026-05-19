import { describe, it } from "node:test";
import assert from "node:assert";
import { walkBash } from "../../../src/bash-walker.js";
import { checkBash } from "../../../src/checker-bash.js";
import { createEmptyConfig } from "../../../src/config-types.js";
import type { SanityConfig, CommandConfig } from "../../../src/config-types.js";

/**
 * Build a test config with a single command rule.
 */
function makeConfig(cmdName: string, cmdConfig: CommandConfig): SanityConfig {
  const config = createEmptyConfig();
  config.commands[cmdName] = cmdConfig;
  return config;
}

/**
 * Build a config where ONLY a specific path triggers a non-allow result.
 *
 * Pattern:
 * - permissive default (allow)
 * - one override that matches ONLY the expected path
 *
 * If the feature under test routes the WRONG arg to the permission check,
 * the override won't match and the result is "allow" — test fails.
 */
function makeConfigWithSpecificPath(
  cmdName: string,
  cmdConfig: CommandConfig,
  permType: "read" | "write",
  pattern: string,
  action: "deny" | "ask",
): SanityConfig {
  const config = createEmptyConfig();
  config.commands[cmdName] = cmdConfig;
  config.permissions[permType].default = "allow";
  config.permissions[permType].overrides.push({ path: [pattern], action });
  return config;
}

describe("arg parsing — plain commands", () => {
  describe("flag detection", () => {
    it("should detect standalone short flag", () => {
      // Feature: hasFlag detects exact match for standalone -f
      // Failure caught: hasFlag returns false for -f (exact match broken)
      // Wrong result if bug: "allow" (flag not detected)
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = checkBash("cmd -f", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect standalone long flag", () => {
      // Feature: hasFlag detects exact match for --force
      // Failure caught: hasFlag returns false for --force
      // Wrong result if bug: "allow"
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "--force", action: "deny" }],
      });
      const result = checkBash("cmd --force", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect short flag inside combined short flags", () => {
      // Feature: hasFlag detects -f inside -rf
      // Failure caught: hasFlag only checks exact match, misses combined
      // Wrong result if bug: "allow"
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = checkBash("cmd -rf", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect multiple short flags inside combined string", () => {
      // Feature: hasFlag detects both -r and -f inside -rf
      // Failure caught: only one flag detected, or neither
      // Wrong result if bug: "allow" or "ask" (instead of "deny")
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [
          { flag: "-r", action: "ask" },
          { flag: "-f", action: "deny" },
        ],
      });
      const result = checkBash("cmd -rf", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should NOT match long flag substring", () => {
      // Feature: --force does NOT match --forced
      // Failure caught: hasFlag uses substring match instead of exact
      // Wrong result if bug: "deny" (false positive match)
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "--force", action: "deny" }],
      });
      const result = checkBash("cmd --forced", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should match declared multi-char single-dash flag exactly (-Wall)", () => {
      // Feature: exact match works for -Wall
      // Failure caught: hasFlag rejects multi-char single-dash flags
      // Wrong result if bug: "allow"
      const config = makeConfig("gcc", {
        default_action: "allow",
        flags: [{ flag: "-Wall", action: "ask" }],
      });
      const result = checkBash("gcc -Wall", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should NOT decompose declared multi-char single-dash flag", () => {
      // Feature: -Wall declared as flag → atomic, not decomposed into -W + -a + -l + -l
      // Failure caught: hasFlag decomposes -Wall, letting -W match inside it
      // Wrong result if bug: "deny" (from -W match)
      const config = makeConfig("gcc", {
        default_action: "allow",
        flags: [
          { flag: "-Wall", action: "ask" },
          { flag: "-W", action: "deny" },
        ],
      });
      const result = checkBash("gcc -Wall", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should decompose undeclared multi-char single-dash flag for single-char match", () => {
      // Feature: -Wall NOT declared → can be decomposed, -W matches inside
      // Failure caught: hasFlag treats ALL multi-char tokens as atomic
      // Wrong result if bug: "allow"
      const config = makeConfig("gcc", {
        default_action: "allow",
        flags: [{ flag: "-W", action: "deny" }],
      });
      const result = checkBash("gcc -Wall", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should NOT match short flag inside non-flag arg", () => {
      // Feature: -f does NOT match inside "file.txt"
      // Failure caught: hasFlag does substring match on all args
      // Wrong result if bug: "deny" (false positive)
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = checkBash("cmd file.txt", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("option value extraction", () => {
    it("should extract option value with space separator", () => {
      // Feature: -o /specific triggers write check on /specific only
      // Failure caught: option value not extracted, or extracted wrong arg
      // Wrong result if bug: "allow" (override not matched)
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [] }, options: { "-o": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("cmd -o /specific", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should extract option value with equals separator", () => {
      // Feature: -o=/specific triggers write check on /specific
      // Failure caught: equals form not handled, value not split
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [] }, options: { "-o": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("cmd -o=/specific", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should consume option value and not count it as positional", () => {
      // Feature: -o consumes next arg, so remaining arg is positional 0
      // Failure caught: option not consumed, both args treated as positionals
      //
      // Setup: positional 0 is read-checked, option -o is write-checked.
      // Only /pos0-read triggers deny on read.
      //
      // Working: -o /opt-value consumed, /pos0-read = positional 0 → read → deny
      // Buggy:   /opt-value = positional 0 → read → allow, /pos0-read = positional 1 → no check → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "0": ["read"] } }, options: { "-o": ["write"] } },
        "read",
        "/pos0-read",
        "deny",
      );
      const result = checkBash("cmd -o /opt-value /pos0-read", config);
      assert.strictEqual(result.action, "deny");
    });
  });

  describe("positional counting", () => {
    it("should count positionals correctly with flags mixed in", () => {
      // Feature: -r is skipped, so src/ = positional 0, dest/ = positional 1
      // Failure caught: -r not skipped, shifting indices
      //
      // Working: dest/ = positional 1 → no override → allow
      // Buggy:   dest/ = positional 2 → no override → allow
      // Hmm, both give allow. Need a different test.
      //
      // Better: make positional 0 the one that triggers. If -r is not skipped,
      // -r becomes positional 0 (no override → allow) and src/ becomes positional 1.
      const config = makeConfigWithSpecificPath(
        "cp",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "0": ["read"] } } },
        "read",
        "/src",
        "deny",
      );
      // cp -r /src /dest
      // Working: -r skipped, /src = pos 0 → read → deny
      // Buggy:   -r not skipped, /src = pos 1 → no override → allow
      // Wrong result if bug: "allow"
      const result = checkBash("cp -r /src /dest", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply negative index override to last positional", () => {
      // Feature: -1 override applies to LAST positional
      // Failure caught: override applies to wrong positional or ignored
      //
      // Working: /last = last positional → read → deny
      // Buggy:   override ignored → all positionals get default_perm [] → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "mv",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "-1": ["read"] } } },
        "read",
        "/last",
        "deny",
      );
      const result = checkBash("mv /first /middle /last", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply positive index override to specific position", () => {
      // Feature: override "1" applies to second positional only
      // Failure caught: override ignored or applied to wrong index
      //
      // Working: /pos1 = positional 1 → read → deny
      // Buggy:   override ignored → all get default_perm [] → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "1": ["read"] } } },
        "read",
        "/pos1",
        "deny",
      );
      const result = checkBash("cmd /pos0 /pos1 /pos2", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should skip declared flags from positional counting", () => {
      // Feature: --force declared as flag → skipped, so next arg is positional 0
      // Failure caught: --force counted as positional
      //
      // Working: /pos0 = positional 0 → read → deny
      // Buggy:   --force = positional 0 → no override → allow, /pos0 = pos 1 → no override → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "0": ["read"] } }, flags: [{ flag: "--force", action: "allow" }] },
        "read",
        "/pos0",
        "deny",
      );
      const result = checkBash("cmd --force /pos0", config);
      assert.strictEqual(result.action, "deny");
    });
  });
});

describe("arg parsing — dynamic args", () => {
  describe("dynamic arg detection in walker", () => {
    it("should mark command substitution as dynamic", () => {
      // Direct walker test — no checker involved
      const result = walkBash("cat $(echo secret.txt)");
      const cat = result.commands.find((c) => c.name === "cat");
      assert.ok(cat);
      assert.deepStrictEqual(cat.args, ["$(echo secret.txt)"]);
      assert.ok(cat.dynamicIndices.has(0));
    });

    it("should mark parameter expansion as dynamic", () => {
      const result = walkBash("cat $HOME/file.txt");
      const cat = result.commands.find((c) => c.name === "cat");
      assert.ok(cat);
      assert.deepStrictEqual(cat.args, ["$HOME/file.txt"]);
      assert.ok(cat.dynamicIndices.has(0));
    });

    it("should mark brace expansion as dynamic", () => {
      const result = walkBash("cat file{1,2}.txt");
      const cat = result.commands.find((c) => c.name === "cat");
      assert.ok(cat);
      assert.deepStrictEqual(cat.args, ["file{1,2}.txt"]);
      assert.ok(cat.dynamicIndices.has(0));
    });

    it("should NOT mark literal args as dynamic", () => {
      const result = walkBash("cat file.txt");
      const cat = result.commands.find((c) => c.name === "cat");
      assert.ok(cat);
      assert.deepStrictEqual(cat.args, ["file.txt"]);
      assert.strictEqual(cat.dynamicIndices.size, 0);
    });

    it("should track dynamic indices in multi-arg commands", () => {
      const result = walkBash("cp $(echo src) dest");
      const cp = result.commands.find((c) => c.name === "cp");
      assert.ok(cp);
      assert.deepStrictEqual(cp.args, ["$(echo src)", "dest"]);
      assert.ok(cp.dynamicIndices.has(0));
      assert.ok(!cp.dynamicIndices.has(1));
    });
  });

  describe("dynamic args excluded from path check", () => {
    it("should not check dynamic arg as a path", () => {
      // Feature: $(echo /specific) is dynamic → skipped from read check
      // Failure caught: dynamic args are checked as literal paths
      //
      // Working: $(echo /specific) skipped, no other args → allow
      // Buggy:   $(echo /specific) checked as read → matches override → deny
      // Wrong result if bug: "deny"
      const config = makeConfigWithSpecificPath(
        "cat",
        { default_action: "allow", positionals: { default_perm: ["read"] } },
        "read",
        "/specific",
        "deny",
      );
      const result = checkBash("cat $(echo /specific)", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("positional indices preserved with dynamic args", () => {
    it("should count dynamic arg in index calculation", () => {
      // Feature: dynamic arg $(echo src) occupies positional slot 0,
      // so /last is positional 1 (last position, -1 override)
      //
      // Failure caught: dynamic args excluded from index calculation,
      // so /last becomes positional 0 instead of 1
      //
      // Working: /last = pos 1 = last → read → deny
      // Buggy:   /last = pos 0 → no -1 override → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cp",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "-1": ["read"] } } },
        "read",
        "/last",
        "deny",
      );
      const result = checkBash("cp $(echo src) /last", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply positive index override accounting for dynamic args", () => {
      // Feature: $(echo a) = pos 0 (dynamic, skipped), /pos1 = pos 1 (override "1")
      //
      // Failure caught: dynamic arg not counted, /pos1 becomes pos 0
      //
      // Working: /pos1 = pos 1 → read → deny
      // Buggy:   /pos1 = pos 0 → no override → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "1": ["read"] } } },
        "read",
        "/pos1",
        "deny",
      );
      const result = checkBash("cmd $(echo a) /pos1 /pos2", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should handle multiple dynamic args mixed with static", () => {
      // Feature: override "2" applies to third positional ($(echo b)),
      // which is dynamic → skipped → no check → allow
      //
      // Failure caught: dynamic detection broken, $(echo b) checked as static
      //
      // Working: $(echo b) is dynamic → skipped → allow
      // Buggy:   $(echo b) treated as static → read /specific → deny
      // Wrong result if bug: "deny"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "2": ["read"] } } },
        "read",
        "/specific",
        "deny",
      );
      const result = checkBash("cmd $(echo a) static1 $(echo /specific) static2", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("dynamic args with options and flags", () => {
    it("should skip dynamic args even after option consumption", () => {
      // Feature: -o consumes $(echo /opt), $(echo /pos) is positional 0
      // but dynamic → skipped
      //
      // Failure caught: dynamic positional not skipped
      //
      // Working: $(echo /pos) dynamic → skipped → allow
      // Buggy:   $(echo /pos) checked as read → matches override → deny
      // Wrong result if bug: "deny"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [], overrides: { "0": ["read"] } }, options: { "-o": ["write"] } },
        "read",
        "/pos",
        "deny",
      );
      const result = checkBash("cmd -o $(echo /opt) $(echo /pos)", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("dynamic option values", () => {
    it("should skip dynamic option value from path check", () => {
      // Feature: -o consumes $(echo /specific) as option value, but it's dynamic → skipped
      //
      // Failure caught: dynamic option value not skipped
      //
      // Working: $(echo /specific) dynamic → skipped → allow
      // Buggy:   $(echo /specific) checked as write → matches override → deny
      // Wrong result if bug: "deny"
      const config = makeConfigWithSpecificPath(
        "gcc",
        { default_action: "allow", positionals: { default_perm: [] }, options: { "-o": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("gcc -o $(echo /specific) main.c", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should check static option value normally", () => {
      // Feature: -o /specific is static → checked as write → matches override
      //
      // Failure caught: option value not extracted at all
      //
      // Working: /specific = write → deny
      // Buggy:   no option value extracted → no checks → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "gcc",
        { default_action: "allow", positionals: { default_perm: [] }, options: { "-o": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("gcc -o /specific main.c", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should handle equals form with dynamic value", () => {
      // Feature: -o=$(echo /specific) — entire token is dynamic → skipped
      //
      // Failure caught: equals form not handled, or dynamic not detected in same token
      //
      // Working: token is dynamic → skipped → allow
      // Buggy:   value extracted and checked as write → deny
      // Wrong result if bug: "deny"
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [] }, options: { "-o": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("cmd -o=$(echo /specific)", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("merged options and flags (tar-like)", () => {
    it("should detect option in combined short string and consume next arg", () => {
      // Feature: -xzf contains option -f, so next arg is consumed as -f's value
      //
      // Setup: -f is read-checked. Only /specific triggers deny on read.
      // file.tar.gz is the consumed value.
      //
      // Working: /specific = -f value → read → deny
      // Buggy:   -f not detected in combined string, /specific = positional → no check → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "tar",
        { default_action: "allow", positionals: { default_perm: [] }, flags: [{ flag: "-x", action: "allow" }], options: { "-f": ["read"] } },
        "read",
        "/specific",
        "deny",
      );
      const result = checkBash("tar -xzf /specific", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply option check on consumed value from combined string", () => {
      // Feature: -xf contains option -f, next arg consumed as write
      //
      // Working: /specific = write → deny
      // Buggy:   -f not detected, /specific = positional → no check → allow
      // Wrong result if bug: "allow"
      const config = makeConfigWithSpecificPath(
        "tar",
        { default_action: "allow", positionals: { default_perm: [] }, flags: [{ flag: "-x", action: "allow" }], options: { "-f": ["write"] } },
        "write",
        "/specific",
        "deny",
      );
      const result = checkBash("tar -xf /specific", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should handle declared multi-char flag atomically in combined context", () => {
      // Feature: -Wall declared as flag → atomic skip.
      // -W is an option, but -Wall being declared prevents decomposition.
      // So main.c becomes positional 0.
      //
      // Setup: positional 0 is read-checked. Only /specific triggers deny.
      //
      // Working: main.c = pos 0 → read → allow
      // Buggy:   -Wall decomposed, -W option detected, main.c consumed as -W value
      //          → write on main.c → allow (write default allow)
      //          → but we need a case where buggy = different result
      //
      // Better setup: make -W option check read, and main.c is /specific
      const config = makeConfigWithSpecificPath(
        "cmd",
        { default_action: "allow", positionals: { default_perm: [] }, flags: [{ flag: "-Wall", action: "allow" }], options: { "-W": ["read"] } },
        "read",
        "/specific",
        "deny",
      );
      // cmd -Wall /specific
      // Working: -Wall atomic skip, /specific = pos 0 → read → deny
      // Buggy:   -Wall decomposed to -W option, /specific consumed as -W value → read → deny
      // Hmm, both give deny. Need different paths.
      //
      // cmd -Wall /other
      // Working: -Wall atomic skip, /other = pos 0 → read → allow
      // Buggy:   -Wall decomposed, -W option consumes /other → read → allow
      // Both give allow too.
      //
      // The real test is that -Wall triggers the FLAG action, not the -W option.
      // If decomposition happens, -W option fires but -Wall flag doesn't.
      // We need a config where -Wall flag = ask and -W option = deny.
      // Working: -Wall matches flag → ask
      // Buggy:   -Wall decomposed → -W option consumes next arg → no next arg → no option check
      //          → but -W option doesn't have an action directly, it just checks the VALUE
      //          → if no value, no check → falls to default_action allow
      // Wrong result if bug: "allow"
      const config2 = makeConfig("cmd", {
        default_action: "allow",
        positionals: { default_perm: [] },
        flags: [{ flag: "-Wall", action: "ask" }],
        options: { "-W": ["write"] },
      });
      const result2 = checkBash("cmd -Wall", config2);
      assert.strictEqual(result2.action, "ask");
    });
  });
});
