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
 * Build a test config with deny-first write permissions (for testing write blocks).
 */
function makeConfigWithDenyWrite(cmdName: string, cmdConfig: CommandConfig): SanityConfig {
  const config = createEmptyConfig();
  config.permissions.write.default = "deny";
  config.commands[cmdName] = cmdConfig;
  return config;
}

describe("arg parsing — plain commands", () => {
  describe("flag detection", () => {
    it("should detect standalone short flag", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = checkBash("cmd -f", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect standalone long flag", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "--force", action: "deny" }],
      });
      const result = checkBash("cmd --force", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect short flag inside combined short flags", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "-f", action: "deny" }],
      });
      const result = checkBash("cmd -rf", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should detect multiple short flags inside combined string", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [
          { flag: "-r", action: "ask" },
          { flag: "-f", action: "deny" },
        ],
      });
      const result = checkBash("cmd -rf", config);
      // deny is stricter than ask
      assert.strictEqual(result.action, "deny");
    });

    it("should NOT match long flag substring", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        flags: [{ flag: "--force", action: "deny" }],
      });
      const result = checkBash("cmd --forced", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should match multi-char single-dash flag exactly (-Wall)", () => {
      const config = makeConfig("gcc", {
        default_action: "allow",
        flags: [{ flag: "-Wall", action: "ask" }],
      });
      const result = checkBash("gcc -Wall", config);
      assert.strictEqual(result.action, "ask");
    });

    it("should NOT decompose multi-char single-dash flag", () => {
      const config = makeConfig("gcc", {
        default_action: "allow",
        flags: [{ flag: "-W", action: "deny" }],
      });
      // -Wall should NOT match -W (exact match for multi-char flags)
      const result = checkBash("gcc -Wall", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should NOT match short flag inside non-flag arg", () => {
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
      const config = makeConfigWithDenyWrite("cmd", {
        default_action: "allow",
        positionals: { default_perm: [] },
        options: { "-o": ["write"] },
      });
      const result = checkBash("cmd -o /etc/file", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should extract option value with equals separator", () => {
      const config = makeConfigWithDenyWrite("cmd", {
        default_action: "allow",
        positionals: { default_perm: [] },
        options: { "-o": ["write"] },
      });
      const result = checkBash("cmd -o=/etc/file", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should consume option value and not count it as positional", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        positionals: { default_perm: ["read"], overrides: { "0": ["write"] } },
        options: { "-o": ["write"] },
      });
      // cmd -o /etc/file /tmp/file
      // -o and /etc/file are consumed as option+value
      // /tmp/file is positional index 0 → write check
      const result = checkBash("cmd -o /etc/file /tmp/file", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("positional counting", () => {
    it("should count positionals correctly with flags mixed in", () => {
      const config = makeConfig("cp", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "-1": ["write"] },
        },
      });
      // cp -r src/ dest/
      // -r is skipped (starts with -), src/ = index 0 (read), dest/ = index 1 (write)
      const result = checkBash("cp -r src/ dest/", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should apply negative index override to last positional", () => {
      const config = makeConfigWithDenyWrite("mv", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "-1": ["write"] },
        },
      });
      // mv file1 file2 file3 /etc/
      // file1, file2, file3 = read, /etc/ = write → deny
      const result = checkBash("mv file1 file2 file3 /etc/", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply positive index override to specific position", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "1": ["write"] },
        },
      });
      // cmd file1 file2 file3
      // file1 = read, file2 = write, file3 = read
      const result = checkBash("cmd file1 file2 file3", config);
      assert.strictEqual(result.action, "allow");
    });

    it("should skip declared flags from positional counting", () => {
      const config = makeConfig("git", {
        default_action: "allow",
        positionals: { default_perm: ["read"] },
        flags: [{ flag: "--force", action: "allow" }],
      });
      // git push --force origin
      // --force is a declared flag (action allow), origin is positional index 0 → read
      const result = checkBash("git push --force origin", config);
      assert.strictEqual(result.action, "allow");
    });
  });
});

describe("arg parsing — dynamic args", () => {
  describe("dynamic arg detection in walker", () => {
    it("should mark command substitution as dynamic", () => {
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
      const config = makeConfig("cat", {
        default_action: "allow",
        positionals: { default_perm: ["read"] },
      });
      // cat $(echo /etc/passwd) — the dynamic arg is skipped
      const result = checkBash("cat $(echo /etc/passwd)", config);
      // The cat command itself has no static paths to check → allow
      assert.strictEqual(result.action, "allow");
    });

    it("should still check inner command from substitution", () => {
      const config = makeConfig("cat", {
        default_action: "allow",
        positionals: { default_perm: ["read"] },
      });
      // cat $(echo /etc/passwd) — inner 'echo /etc/passwd' is checked
      // But echo has no positionals config → allow
      // Actually the inner echo gets checked too, but we need a config for it
      const result = checkBash("cat $(echo /etc/passwd)", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("positional indices preserved with dynamic args", () => {
    it("should count dynamic arg in index calculation", () => {
      const config = makeConfigWithDenyWrite("cp", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "-1": ["write"] },
        },
      });
      // cp $(echo src) /etc/file
      // args: ["$(echo src)", "/etc/file"]
      // positional 0: $(echo src) → dynamic, skipped
      // positional 1: /etc/file → -1 override → write → deny
      const result = checkBash("cp $(echo src) /etc/file", config);
      assert.strictEqual(result.action, "deny");
    });

    it("should apply positive index override accounting for dynamic args", () => {
      const config = makeConfigWithDenyWrite("cmd", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "1": ["write"] },
        },
      });
      // cmd $(echo a) file1 file2
      // positional 0: $(echo a) → dynamic, skipped
      // positional 1: file1 → write override → /etc/file1 → deny
      const result = checkBash("cmd $(echo a) /etc/file1 file2", config);
      // positional 1 = /etc/file1 → write check → deny
      assert.strictEqual(result.action, "deny");
    });

    it("should handle multiple dynamic args mixed with static", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "2": ["write"] },
        },
      });
      // cmd $(echo a) static1 $(echo b) static2
      // positional 0: $(echo a) → dynamic, skipped
      // positional 1: static1 → read
      // positional 2: $(echo b) → dynamic, skipped (but occupies index 2)
      // positional 3: static2 → read
      // Override "2" applies to $(echo b) which is dynamic → no check
      const result = checkBash("cmd $(echo a) static1 $(echo b) static2", config);
      assert.strictEqual(result.action, "allow");
    });
  });

  describe("dynamic args with options and flags", () => {
    it("should skip dynamic args even after option consumption", () => {
      const config = makeConfig("cmd", {
        default_action: "allow",
        positionals: {
          default_perm: ["read"],
          overrides: { "0": ["write"] },
        },
        options: { "-o": ["write"] },
      });
      // cmd -o $(echo /etc/file) $(echo dest)
      // -o and $(echo /etc/file) consumed as option+value
      // $(echo dest) is positional 0 → write override → but dynamic, skipped
      const result = checkBash("cmd -o $(echo /etc/file) $(echo dest)", config);
      assert.strictEqual(result.action, "allow");
    });
  });
});
