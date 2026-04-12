import { describe, it } from "node:test";
import assert from "node:assert";
import extension from "../extension.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Integration tests for the Pi-Sanity extension
 * 
 * These tests verify that the extension correctly intercepts tool calls
 * and returns the expected block/allow responses.
 */

// Mock UI object
function createMockUI() {
  return {
    notify: (message: string, type: string) => {
      // Notification called
    },
    confirm: (title: string, message: string, options?: any) => {
      // Mock confirmation - return false by default
      return Promise.resolve(false);
    },
  };
}

// Mock ExtensionAPI - using any for simplicity since we're testing extension logic
function createMockPi(): { pi: any; calls: any[] } {
  const calls: any[] = [];
  const handlers: Map<string, Function> = new Map();

  const pi = {
    on: (event: string, handler: Function) => {
      handlers.set(event, handler);
      calls.push({ type: 'on', event });
    },
    // Simulate a tool call and return the result
    __simulateToolCall: async (event: any, ctx: any) => {
      const handler = handlers.get('tool_call');
      if (!handler) return undefined;
      return await handler(event, ctx);
    },
  };

  return { pi, calls };
}

// Create mock tool context
function createMockContext(hasUI = true): any {
  return {
    hasUI,
    ui: hasUI ? createMockUI() : undefined,
  };
}

describe("extension.ts integration", () => {
  
  describe("tool call registration", () => {
    it("should register for tool_call events", () => {
      const { pi, calls } = createMockPi();
      extension(pi as ExtensionAPI);
      
      assert.ok(calls.some(c => c.type === 'on' && c.event === 'tool_call'),
        "Extension should register for tool_call events");
    });
  });

  describe("read tool", () => {
    it("should allow reading allowed files", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "read",
        input: { path: "package.json" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined to allow");
    });

    it("should block reading protected files", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "read",
        input: { path: "~/.bashrc" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
      assert.ok(result.reason, "Should include reason");
    });

    it("should block when path is missing", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "read",
        input: {},
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should block when path is missing");
      assert.ok(result.reason, "Should include reason");
    });
  });

  describe("write tool", () => {
    it("should allow writing to allowed locations", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "write",
        input: { path: "test-file.txt" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined to allow");
    });

    it("should block writing to protected locations", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "write",
        input: { path: "~/.bashrc" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
      assert.ok(result.reason, "Should include reason");
    });

    it("should block when path is missing", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "write",
        input: {},
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should block when path is missing");
      assert.ok(result.reason, "Should include reason");
    });
  });

  describe("edit tool", () => {
    it("should allow editing allowed files", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "edit",
        input: { path: "package.json" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined to allow");
    });

    it("should block editing protected files", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "edit",
        input: { path: "~/.bashrc" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
    });

    it("should block when path is missing", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "edit",
        input: {},
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should block when path is missing");
      assert.ok(result.reason, "Should include reason");
    });
  });

  describe("bash tool", () => {
    it("should allow safe commands", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "bash",
        input: { command: "ls -la" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined to allow");
    });

    it("should block dangerous commands", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "bash",
        input: { command: "dd if=/dev/zero of=/tmp/test" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
      assert.ok(result.reason, "Should include reason");
    });

    it("should block commands with parse errors", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "bash",
        input: { command: 'echo "unclosed' },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true for parse errors");
    });

    it("should block when command is missing", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "bash",
        input: {},
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should block when command is missing");
      assert.ok(result.reason, "Should include reason");
    });
  });

  describe("unhandled tools", () => {
    it("should ignore unknown tools", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "unknown_tool",
        input: { something: "value" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined for unknown tools");
    });

    it("should ignore search tool", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "search",
        input: { pattern: "test" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined for search tool");
    });
  });

  describe("UI notifications", () => {
    it("should notify when blocking with deny action", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      let notifyCalled = false;
      let notifyMsg = "";
      let notifyType = "";
      const ctx = createMockContext(true);
      ctx.ui.notify = (msg: string, type: string) => {
        notifyCalled = true;
        notifyMsg = msg;
        notifyType = type;
      };
      
      // Use a command that results in "deny" (not "ask")
      const event = {
        toolName: "bash",
        input: { command: "dd if=/dev/zero of=/tmp/test" },
      };
      
      await pi.__simulateToolCall(event, ctx);
      
      assert.ok(notifyCalled, "Should call ui.notify when blocking with deny");
      assert.ok(notifyMsg.includes("Blocked"), "Message should indicate blocking");
      assert.strictEqual(notifyType, "warning", "Type should be warning");
    });

    it("should confirm when asking for user approval", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      let confirmCalled = false;
      const ctx = createMockContext(true);
      ctx.ui.confirm = (title: string, msg: string, options?: any) => {
        confirmCalled = true;
        assert.ok(title.includes("Pi-Sanity"), "Title should be Pi-Sanity");
        return Promise.resolve(false); // User cancels
      };
      
      // Use a command that results in "ask"
      const event = {
        toolName: "read",
        input: { path: "~/.bashrc" },
      };
      
      await pi.__simulateToolCall(event, ctx);
      
      assert.ok(confirmCalled, "Should call ui.confirm for ask actions");
    });

    it("should not show UI when UI is not available", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const ctx = createMockContext(false);
      
      const event = {
        toolName: "write",
        input: { path: "~/.bashrc" },
      };
      
      // Should not throw even without UI
      const result = await pi.__simulateToolCall(event, ctx);
      
      assert.ok(result && result.block === true, "Should still block even without UI");
    });
  });

  describe("return format", () => {
    it("should return correct format for blocked operations", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "write",
        input: { path: "~/.bashrc" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result, "Should return a result");
      assert.strictEqual(result.block, true, "Should have block: true");
      assert.ok(typeof result.reason === 'string', "Should have string reason");
      assert.ok(result.reason.length > 0, "Reason should not be empty");
    });

    it("should return undefined for allowed operations", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const event = {
        toolName: "read",
        input: { path: "package.json" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.strictEqual(result, undefined, "Should return undefined for allowed operations");
    });
  });

});
