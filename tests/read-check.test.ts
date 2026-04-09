import { describe, it } from "node:test";
import assert from "node:assert";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { checkRead } from "../src/read-check.js";

const ctx = {
  projectRoot: join(homedir(), "my-project"),
  homeDir: homedir(),
};

describe("checkRead - project files", () => {
  it("allows reading files inside project", () => {
    const result = checkRead(join(ctx.projectRoot, "src", "main.ts"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows reading files in project root", () => {
    const result = checkRead(join(ctx.projectRoot, "README.md"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows reading hidden files in project (like .gitignore)", () => {
    const result = checkRead(join(ctx.projectRoot, ".gitignore"), ctx);
    assert.strictEqual(result.action, "allow");
  });
});

describe("checkRead - temp files", () => {
  it("allows reading temp files", () => {
    assert.strictEqual(checkRead(join(tmpdir(), "file.txt"), ctx).action, "allow");
    assert.strictEqual(checkRead(join(tmpdir(), "data"), ctx).action, "allow");
  });
});

describe("checkRead - home directory", () => {
  it("allows reading non-hidden files in home", () => {
    const result = checkRead(join(ctx.homeDir, "Documents", "file.txt"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows reading regular files in home", () => {
    const result = checkRead(join(ctx.homeDir, "file.txt"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("asks for hidden files in home", () => {
    const result = checkRead(join(ctx.homeDir, ".bashrc"), ctx);
    assert.strictEqual(result.action, "ask");
    assert.ok(result.reason?.includes("hidden"));
  });

  it("asks for hidden files in home subdirs", () => {
    const result = checkRead(join(ctx.homeDir, ".ssh", "id_rsa"), ctx);
    assert.strictEqual(result.action, "ask");
  });

  it("asks for hidden config files", () => {
    const result = checkRead(join(ctx.homeDir, ".aws", "credentials"), ctx);
    assert.strictEqual(result.action, "ask");
  });

  it("allows reading public key files (even hidden)", () => {
    const result = checkRead(join(ctx.homeDir, ".ssh", "id_rsa.pub"), ctx);
    assert.strictEqual(result.action, "allow");
  });

  it("allows reading ASCII-armored public keys", () => {
    const result = checkRead(join(ctx.homeDir, ".gnupg", "public.asc"), ctx);
    assert.strictEqual(result.action, "allow");
  });
});

describe("checkRead - outside project and home", () => {
  it("allows reading system files", () => {
    // On Unix: /etc/passwd, on Windows: C:\Windows\System32\drivers\etc\hosts
    assert.strictEqual(checkRead("/etc/passwd", ctx).action, "allow");
  });
});
