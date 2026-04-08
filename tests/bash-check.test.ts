import { describe, it } from "node:test";
import assert from "node:assert";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { checkBash } from "../src/bash-check.ts";

// Helper to join paths with forward slashes for bash compatibility
const j = (...parts: string[]) => join(...parts).replace(/\\/g, "/");

const ctx = {
  projectRoot: j(homedir(), "my-project"),
  homeDir: homedir().replace(/\\/g, "/"),
};

const cwd = ctx.projectRoot;

describe("checkBash - read operations", () => {
  it("allows reading from project", () => {
    const result = checkBash(`cat ${j(ctx.projectRoot, "README.md")}`, ctx, cwd);
    assert.strictEqual(result.action, "allow");
  });

  it("asks for reading hidden home files", () => {
    const result = checkBash("cat ~/.ssh/id_rsa", ctx, cwd);
    assert.strictEqual(result.action, "ask");
  });

  it("allows reading from temp", () => {
    const result = checkBash(`cat ${j(tmpdir(), "file.txt")}`, ctx, cwd);
    assert.strictEqual(result.action, "allow");
  });

  it("checks all commands in pipeline", () => {
    const result = checkBash("cat ~/.aws/credentials | grep key", ctx, cwd);
    assert.strictEqual(result.action, "ask");
  });
});

describe("checkBash - write operations", () => {
  it("allows writing to project", () => {
    const result = checkBash(`echo hello > ${j(ctx.projectRoot, "file.txt")}`, ctx, cwd);
    assert.strictEqual(result.action, "allow");
  });

  it("denies writing to .git", () => {
    const result = checkBash(`echo config > ${j(ctx.projectRoot, ".git", "config")}`, ctx, cwd);
    assert.strictEqual(result.action, "deny");
  });

  it("asks for writing outside project", () => {
    const result = checkBash("echo hello > ~/file.txt", ctx, cwd);
    assert.strictEqual(result.action, "ask");
  });

  it("allows writing to temp", () => {
    const result = checkBash(`cat file.txt > ${j(tmpdir(), "output.txt")}`, ctx, cwd);
    assert.strictEqual(result.action, "allow");
  });
});

describe("checkBash - copy/move operations", () => {
  it("allows cp within project", () => {
    const result = checkBash(
      `cp ${j(ctx.projectRoot, "src", "main.ts")} ${j(ctx.projectRoot, "src", "backup.ts")}`,
      ctx,
      cwd
    );
    assert.strictEqual(result.action, "allow");
  });

  it("asks for cp to outside project", () => {
    const result = checkBash(`cp ${j(ctx.projectRoot, "file.txt")} ~/backup.txt`, ctx, cwd);
    assert.strictEqual(result.action, "ask");
  });
});


