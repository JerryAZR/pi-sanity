import { describe, it } from "node:test";
import assert from "node:assert";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { checkWrite } from "../src/write-check.ts";

const ctx = {
  projectRoot: join(homedir(), "my-project"),
  homeDir: homedir(),
};

describe("checkWrite - project files", () => {
  it("allows writing files inside project", () => {
    const result = checkWrite(join(ctx.projectRoot, "src", "main.ts"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows creating directories in project", () => {
    const result = checkWrite(join(ctx.projectRoot, "new-dir"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows writing .gitignore in project", () => {
    const result = checkWrite(join(ctx.projectRoot, ".gitignore"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows writing to node_modules (cache clearing)", () => {
    const result = checkWrite(join(ctx.projectRoot, "node_modules", ".package-lock.json"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("denies writing to .git/ directory", () => {
    const result = checkWrite(join(ctx.projectRoot, ".git", "config"), ctx);
    assert.strictEqual(result.action, "deny");
    assert.ok(result.reason?.includes(".git"));
  });

  it("denies writing to .git/ HEAD", () => {
    const result = checkWrite(join(ctx.projectRoot, ".git", "HEAD"), ctx);
    assert.strictEqual(result.action, "deny");
  });
});

describe("checkWrite - temp files", () => {
  it("allows writing to system temp directory", () => {
    const tempDir = tmpdir();
    assert.strictEqual(checkWrite(join(tempDir, "output.txt"), ctx).action, "allow");
    assert.strictEqual(checkWrite(join(tempDir, "subdir", "file"), ctx).action, "allow");
  });
});

describe("checkWrite - outside project", () => {
  it("asks when writing to home directory", () => {
    const result = checkWrite(join(ctx.homeDir, ".myapp", "config"), ctx);
    assert.strictEqual(result.action, "ask");
    assert.ok(result.reason?.includes("outside project"));
  });

  it("asks when writing to home non-hidden", () => {
    const result = checkWrite(join(ctx.homeDir, "Documents", "output.txt"), ctx);
    assert.strictEqual(result.action, "ask");
  });

  it("asks when writing to system directory", () => {
    // On Unix: /etc, on Windows: C:\Windows\System32
    assert.strictEqual(checkWrite("/etc/myapp/config", ctx).action, "ask");
  });

  it("asks when writing outside project entirely", () => {
    const result = checkWrite(join(homedir(), "..", "other-project", "file.txt"), ctx);
    assert.strictEqual(result.action, "ask");
  });
});
