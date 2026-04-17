import { describe, it } from "node:test";
import assert from "node:assert";
import extension from "../../../extension.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Mock UI object
function createMockUI() {
  return {
    notify: (message: string, type: string) => {},
    confirm: (title: string, message: string, options?: any) => {
      return Promise.resolve(false);
    },
    setStatus: (key: string, text: string | undefined) => {},
    setWidget: (key: string, content: string[] | undefined, options?: any) => {},
  };
}

// Mock ExtensionAPI
function createMockPi(): { pi: any; calls: any[] } {
  const calls: any[] = [];
  const handlers: Map<string, Function> = new Map();

  const pi = {
    on: (event: string, handler: Function) => {
      handlers.set(event, handler);
      calls.push({ type: 'on', event });
    },
    __simulateToolCall: async (event: any, ctx: any) => {
      const handler = handlers.get('tool_call');
      if (!handler) return undefined;
      return await handler(event, ctx);
    },
    __simulateSessionStart: async (event: any, ctx: any) => {
      const handler = handlers.get('session_start');
      if (!handler) return undefined;
      return await handler(event, ctx);
    },
    __simulateToolResult: async (event: any, ctx: any) => {
      const handler = handlers.get('tool_result');
      if (!handler) return undefined;
      return await handler(event, ctx);
    },
  };

  return { pi, calls };
}

function createMockContext(hasUI = true): any {
  return {
    hasUI,
    ui: hasUI ? createMockUI() : undefined,
  };
}

describe("extension tool interception", () => {
  describe("registration", () => {
    it("should register for tool_call, tool_result and session_start events", () => {
      const { pi, calls } = createMockPi();
      extension(pi as ExtensionAPI);
      
      assert.ok(calls.some(c => c.type === 'on' && c.event === 'tool_call'),
        "Extension should register for tool_call events");
      assert.ok(calls.some(c => c.type === 'on' && c.event === 'tool_result'),
        "Extension should register for tool_result events");
      assert.ok(calls.some(c => c.type === 'on' && c.event === 'session_start'),
        "Extension should register for session_start events");
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
        input: { path: "~/.ssh/id_rsa" },
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
        input: { path: "~/.ssh/id_rsa" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
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
        input: { path: "~/.ssh/id_rsa" },
      };
      
      const result = await pi.__simulateToolCall(event, createMockContext());
      
      assert.ok(result && result.block === true, "Should return block: true");
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
  });

  describe("UI interaction", () => {
    it("should confirm when asking for user approval", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      let confirmCalled = false;
      const ctx = createMockContext(true);
      ctx.ui.confirm = (title: string, msg: string, options?: any) => {
        confirmCalled = true;
        assert.ok(title.includes("Pi-Sanity"), "Title should be Pi-Sanity");
        return Promise.resolve(false);
      };
      
      const event = {
        toolName: "read",
        input: { path: "~/.aws/credentials" },
      };
      
      const result = await pi.__simulateToolCall(event, ctx);
      
      assert.ok(confirmCalled, "Should call ui.confirm for ask actions");
      assert.ok(result && result.block === true, "Should block when user cancels");
      assert.ok(result.reason.includes("blocked by user"), "Reason should indicate user blocked it");
    });

    it("should not show UI when UI is not available", async () => {
      const { pi } = createMockPi();
      extension(pi as ExtensionAPI);
      
      const ctx = createMockContext(false);
      
      const event = {
        toolName: "write",
        input: { path: "~/.aws/credentials" },
      };
      
      const result = await pi.__simulateToolCall(event, ctx);
      
      assert.ok(result && result.block === true, "Should still block even without UI");
    });
  });
});
