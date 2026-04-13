import { describe, it } from "node:test";
import assert from "node:assert";
import * as os from "os";
import { checkBash, loadDefaultConfig } from "../../../src/index.js";

describe("git protection scenarios", () => {
  const config = loadDefaultConfig();

  it("should ask for writing to .git/config", () => {
    const result = checkBash("echo 'evil' > .git/config", config);
    assert.strictEqual(result.action, "ask");
  });

  it("should ask for writing to .git/HEAD", () => {
    const result = checkBash("cp file.txt .git/HEAD", config);
    assert.strictEqual(result.action, "ask");
  });

  it("should allow writing to normal files", () => {
    const result = checkBash("echo 'hello' > file.txt", config);
    assert.strictEqual(result.action, "allow");
  });

  it("should ask for submodule .git directories", () => {
    const result = checkBash("echo 'evil' > libs/submodule/.git/config", config);
    assert.strictEqual(result.action, "ask");
  });

  it("should ask for nested .git directories", () => {
    const result = checkBash("cp file.txt vendor/lib/.git/HEAD", config);
    assert.strictEqual(result.action, "ask");
  });
});
