import { describe, it } from "node:test";
import assert from "node:assert";
import { stricterAction, aggregateResults } from "../../src/action-utils.js";

describe("stricterAction", () => {
  it("should treat deny as stricter than ask and allow", () => {
    assert.strictEqual(stricterAction("allow", "deny"), "deny");
    assert.strictEqual(stricterAction("deny", "allow"), "deny");
    assert.strictEqual(stricterAction("ask", "deny"), "deny");
    assert.strictEqual(stricterAction("deny", "ask"), "deny");
  });

  it("should treat ask as stricter than allow", () => {
    assert.strictEqual(stricterAction("allow", "ask"), "ask");
    assert.strictEqual(stricterAction("ask", "allow"), "ask");
  });

  it("should keep equal actions", () => {
    assert.strictEqual(stricterAction("allow", "allow"), "allow");
    assert.strictEqual(stricterAction("ask", "ask"), "ask");
    assert.strictEqual(stricterAction("deny", "deny"), "deny");
  });
});

describe("aggregateResults", () => {
  it("should return allow for empty results", () => {
    const result = aggregateResults([]);
    assert.strictEqual(result.action, "allow");
    assert.strictEqual(result.reason, undefined);
  });

  it("should return the single result", () => {
    const result = aggregateResults([{ action: "ask", reason: "sensitive" }]);
    assert.strictEqual(result.action, "ask");
    assert.strictEqual(result.reason, "sensitive");
  });

  it("should pick the strictest action", () => {
    const result = aggregateResults([
      { action: "allow" },
      { action: "ask" },
      { action: "allow" },
    ]);
    assert.strictEqual(result.action, "ask");
  });

  it("should prefer deny over ask", () => {
    const result = aggregateResults([
      { action: "ask" },
      { action: "deny" },
    ]);
    assert.strictEqual(result.action, "deny");
  });

  it("should join reasons with semicolons", () => {
    const result = aggregateResults([
      { action: "ask", reason: "first" },
      { action: "deny", reason: "second" },
    ]);
    assert.strictEqual(result.action, "deny");
    assert.ok(result.reason?.includes("first"));
    assert.ok(result.reason?.includes("second"));
    assert.ok(result.reason?.includes("; "));
  });
  it("should return allow with no reason when all results allow", () => {
    const result = aggregateResults([
      { action: "allow" },
      { action: "allow", reason: undefined },
    ]);
    assert.strictEqual(result.action, "allow");
    assert.strictEqual(result.reason, undefined);
  });

  it("should include reason when at least one result has a reason", () => {
    const result = aggregateResults([
      { action: "allow" },
      { action: "allow", reason: "just checking" },
    ]);
    assert.strictEqual(result.action, "allow");
    assert.strictEqual(result.reason, "just checking");
  });


  it("should omit undefined reasons", () => {
    const result = aggregateResults([
      { action: "ask" },
      { action: "ask", reason: "only" },
    ]);
    assert.strictEqual(result.reason, "only");
  });
});
