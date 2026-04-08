import { describe, it } from "node:test";
import assert from "node:assert";
import { checkNpmGlobal } from "../src/npm-check.ts";

describe("checkNpmGlobal - npm", () => {
  it("allows local npm install", () => {
    assert.strictEqual(checkNpmGlobal("npm install express").action, "allow");
    assert.strictEqual(checkNpmGlobal("npm i express").action, "allow");
    assert.strictEqual(checkNpmGlobal("npm install").action, "allow");
  });

  it("asks for npm global install (-g)", () => {
    const result = checkNpmGlobal("npm install -g express");
    assert.strictEqual(result.action, "ask");
    assert.ok(result.reason?.includes("global"));
  });

  it("asks for npm global install (--global)", () => {
    const result = checkNpmGlobal("npm install --global express");
    assert.strictEqual(result.action, "ask");
  });

  it("asks for npm global uninstall", () => {
    assert.strictEqual(checkNpmGlobal("npm uninstall -g express").action, "ask");
    assert.strictEqual(checkNpmGlobal("npm rm --global express").action, "ask");
  });

  it("asks for npm global link", () => {
    assert.strictEqual(checkNpmGlobal("npm link -g").action, "ask");
  });

  it("allows npm info commands", () => {
    assert.strictEqual(checkNpmGlobal("npm list").action, "allow");
    assert.strictEqual(checkNpmGlobal("npm --version").action, "allow");
  });
});

describe("checkNpmGlobal - yarn", () => {
  it("allows local yarn add", () => {
    assert.strictEqual(checkNpmGlobal("yarn add express").action, "allow");
  });

  it("asks for yarn global", () => {
    const result = checkNpmGlobal("yarn global add express");
    assert.strictEqual(result.action, "ask");
    assert.ok(result.reason?.includes("yarn"));
  });

  it("asks for yarn global remove", () => {
    assert.strictEqual(checkNpmGlobal("yarn global remove express").action, "ask");
  });

  it("allows yarn info commands", () => {
    assert.strictEqual(checkNpmGlobal("yarn list").action, "allow");
  });
});

describe("checkNpmGlobal - pnpm", () => {
  it("allows local pnpm add", () => {
    assert.strictEqual(checkNpmGlobal("pnpm add express").action, "allow");
  });

  it("asks for pnpm global add (-g)", () => {
    const result = checkNpmGlobal("pnpm add -g express");
    assert.strictEqual(result.action, "ask");
    assert.ok(result.reason?.includes("pnpm"));
  });

  it("asks for pnpm global add (--global)", () => {
    assert.strictEqual(checkNpmGlobal("pnpm add --global express").action, "ask");
  });

  it("asks for pnpm global remove", () => {
    assert.strictEqual(checkNpmGlobal("pnpm remove -g express").action, "ask");
  });
});

describe("checkNpmGlobal - case handling", () => {
  it("handles uppercase NPM", () => {
    assert.strictEqual(checkNpmGlobal("NPM install -g express").action, "ask");
  });

  it("handles mixed case", () => {
    assert.strictEqual(checkNpmGlobal("Npm Install -G Express").action, "ask");
  });
});
