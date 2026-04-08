import { describe, it } from "node:test";
import assert from "node:assert";
import {
  analyzeBash,
  isFileCommand,
  getWriteTargets,
  getReadSources,
} from "../src/bash-analyzer.ts";

describe("analyzeBash - simple commands", () => {
  it("extracts simple command", () => {
    const cmds = analyzeBash("cat file.txt");
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].command, "cat");
    assert.deepStrictEqual(cmds[0].args, ["file.txt"]);
  });

  it("extracts command with multiple args", () => {
    const cmds = analyzeBash("cp src1 src2 dst");
    assert.strictEqual(cmds.length, 1);
    assert.strictEqual(cmds[0].command, "cp");
    assert.deepStrictEqual(cmds[0].args, ["src1", "src2", "dst"]);
  });

  it("ignores flags in args", () => {
    const cmds = analyzeBash("rm -rf file1 file2");
    assert.strictEqual(cmds[0].command, "rm");
    assert.deepStrictEqual(cmds[0].args, ["file1", "file2"]);
  });

  it("handles quoted arguments", () => {
    const cmds = analyzeBash('cat "file with spaces.txt"');
    assert.strictEqual(cmds[0].args[0], "file with spaces.txt");
  });
});

describe("analyzeBash - pipelines", () => {
  it("extracts all commands in pipeline", () => {
    const cmds = analyzeBash("cat file.txt | grep pattern | sort");
    assert.strictEqual(cmds.length, 3);
    assert.strictEqual(cmds[0].command, "cat");
    assert.strictEqual(cmds[1].command, "grep");
    assert.strictEqual(cmds[2].command, "sort");
  });

  it("preserves args in pipeline", () => {
    const cmds = analyzeBash("cat file.txt | grep -i pattern");
    assert.strictEqual(cmds[1].args.length, 1);
    assert.strictEqual(cmds[1].args[0], "pattern");
  });
});

describe("analyzeBash - redirects", () => {
  it("extracts output redirect", () => {
    const cmds = analyzeBash("echo hello > file.txt");
    assert.strictEqual(cmds[0].redirects.length, 1);
    assert.strictEqual(cmds[0].redirects[0].operator, ">");
    assert.strictEqual(cmds[0].redirects[0].target, "file.txt");
  });

  it("extracts input redirect", () => {
    const cmds = analyzeBash("sort < input.txt");
    assert.strictEqual(cmds[0].redirects.length, 1);
    assert.strictEqual(cmds[0].redirects[0].operator, "<");
    assert.strictEqual(cmds[0].redirects[0].target, "input.txt");
  });

  it("extracts append redirect", () => {
    const cmds = analyzeBash("echo hello >> log.txt");
    assert.strictEqual(cmds[0].redirects[0].operator, ">>");
  });

  it("handles multiple redirects", () => {
    const cmds = analyzeBash("cat < input.txt > output.txt");
    assert.strictEqual(cmds[0].redirects.length, 2);
  });
});

describe("analyzeBash - compound commands", () => {
  it("handles semicolon separated commands", () => {
    const cmds = analyzeBash("cd /tmp; ls; cat file");
    assert.strictEqual(cmds.length, 3);
  });

  it("handles && and ||", () => {
    const cmds = analyzeBash("mkdir dir && cd dir || echo failed");
    assert.strictEqual(cmds.length, 3);
  });
});

describe("isFileCommand", () => {
  it("recognizes read commands", () => {
    assert.strictEqual(isFileCommand("cat"), true);
    assert.strictEqual(isFileCommand("grep"), true);
    assert.strictEqual(isFileCommand("ls"), true);
  });

  it("recognizes write commands", () => {
    assert.strictEqual(isFileCommand("rm"), true);
    assert.strictEqual(isFileCommand("cp"), true);
    assert.strictEqual(isFileCommand("mkdir"), true);
  });

  it("rejects non-file commands", () => {
    assert.strictEqual(isFileCommand("echo"), false);
    assert.strictEqual(isFileCommand("cd"), false);
    assert.strictEqual(isFileCommand("pwd"), false);
  });

  it("is case insensitive", () => {
    assert.strictEqual(isFileCommand("CAT"), true);
    assert.strictEqual(isFileCommand("Rm"), true);
  });
});

describe("getWriteTargets", () => {
  it("gets redirect targets", () => {
    const cmds = analyzeBash("echo hello > file.txt");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["file.txt"]);
  });

  it("gets cp destination", () => {
    const cmds = analyzeBash("cp src dst");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["dst"]);
  });

  it("gets mv destination", () => {
    const cmds = analyzeBash("mv old new");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["new"]);
  });

  it("gets dd output file", () => {
    const cmds = analyzeBash("dd if=/dev/zero of=/tmp/file");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["/tmp/file"]);
  });

  it("gets touch targets", () => {
    const cmds = analyzeBash("touch file1 file2");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["file1", "file2"]);
  });

  it("gets rm targets", () => {
    const cmds = analyzeBash("rm file1 file2");
    const targets = getWriteTargets(cmds[0]);
    assert.deepStrictEqual(targets, ["file1", "file2"]);
  });

  it("combines redirects and command args", () => {
    const cmds = analyzeBash("cat file > output.txt");
    const targets = getWriteTargets(cmds[0]);
    assert.ok(targets.includes("output.txt"));
  });
});

describe("getReadSources", () => {
  it("gets cat sources", () => {
    const cmds = analyzeBash("cat file1 file2");
    const sources = getReadSources(cmds[0]);
    assert.deepStrictEqual(sources, ["file1", "file2"]);
  });

  it("gets cp sources (all but last)", () => {
    const cmds = analyzeBash("cp src1 src2 dst");
    const sources = getReadSources(cmds[0]);
    assert.deepStrictEqual(sources, ["src1", "src2"]);
  });

  it("gets dd input file", () => {
    const cmds = analyzeBash("dd if=/dev/zero of=/tmp/file");
    const sources = getReadSources(cmds[0]);
    assert.deepStrictEqual(sources, ["/dev/zero"]);
  });

  it("gets input redirect", () => {
    const cmds = analyzeBash("sort < input.txt");
    const sources = getReadSources(cmds[0]);
    assert.deepStrictEqual(sources, ["input.txt"]);
  });

  it("gets find path", () => {
    const cmds = analyzeBash("find /path -name '*.txt'");
    const sources = getReadSources(cmds[0]);
    assert.deepStrictEqual(sources, ["/path"]);
  });
});
