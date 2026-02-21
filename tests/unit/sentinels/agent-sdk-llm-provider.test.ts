import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AgentSdkLlmProvider } from "../../../server/sentinels/agent-sdk-llm-provider.js";
import { createAgentSdkSentinelFallback } from "../../../server/sentinels/agent-sdk-sentinel-fallback.js";
import type { SentinelConfig } from "../../../server/types/sentinel-types.js";
import type { HankweaveGenerateTextOptions } from "../../../server/types/llm-call-types.js";
import { Logger } from "../../../server/utils.js";

// Mock logger
class MockLogger extends Logger {
  logs: Array<{ message: string; level: string }> = [];

  constructor() {
    super("/dev/null");
  }

  log(message: string, level: "info" | "error" | "debug" = "info"): void {
    this.logs.push({ message, level });
  }
}

describe("AgentSdkLlmProvider", () => {
  describe("hasOAuthAuth()", () => {
    const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

    afterEach(() => {
      // Restore environment to original state
      if (originalToken !== undefined) {
        process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
      } else {
        delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      }
    });

    test("returns true when CLAUDE_CODE_OAUTH_TOKEN is set", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";
      expect(AgentSdkLlmProvider.hasOAuthAuth()).toBe(true);
    });

    test("returns false when no OAuth token exists", () => {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      expect(AgentSdkLlmProvider.hasOAuthAuth()).toBe(false);
    });

    test("returns false for empty string token", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "";
      expect(AgentSdkLlmProvider.hasOAuthAuth()).toBe(false);
    });
  });

  describe("createLlmCallFn()", () => {
    let logger: MockLogger;

    beforeEach(() => {
      logger = new MockLogger();
    });

    test("returns a function with correct signature", () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5", logger);
      const fn = provider.createLlmCallFn();
      expect(typeof fn).toBe("function");
    });

    test("throws when no user message is present", async () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5", logger);
      const fn = provider.createLlmCallFn();

      const options: HankweaveGenerateTextOptions = {
        messages: [],
      };

      try {
        await fn("test-sentinel", options);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain("No user message found");
      }
    });
  });

  describe("session management", () => {
    test("clearSession removes a specific session", () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5");

      // Access private sessionIds via type assertion for testing
      const providerAny = provider as unknown as { sessionIds: Map<string, string> };
      providerAny.sessionIds.set("sentinel-1", "session-abc");
      providerAny.sessionIds.set("sentinel-2", "session-def");

      provider.clearSession("sentinel-1");

      expect(providerAny.sessionIds.has("sentinel-1")).toBe(false);
      expect(providerAny.sessionIds.has("sentinel-2")).toBe(true);
    });

    test("clearAllSessions removes all sessions", () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5");

      const providerAny = provider as unknown as { sessionIds: Map<string, string> };
      providerAny.sessionIds.set("sentinel-1", "session-abc");
      providerAny.sessionIds.set("sentinel-2", "session-def");
      providerAny.sessionIds.set("sentinel-3", "session-ghi");

      provider.clearAllSessions();

      expect(providerAny.sessionIds.size).toBe(0);
    });
  });

  describe("constructor", () => {
    test("stores modelId correctly", () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5");
      const providerAny = provider as unknown as { modelId: string };
      expect(providerAny.modelId).toBe("claude-haiku-4-5");
    });

    test("initializes with empty session map", () => {
      const provider = new AgentSdkLlmProvider("claude-haiku-4-5");
      const providerAny = provider as unknown as { sessionIds: Map<string, string> };
      expect(providerAny.sessionIds.size).toBe(0);
    });
  });
});

describe("createAgentSdkSentinelFallback", () => {
  const originalToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  let logger: MockLogger;

  const makeConfig = (overrides: Partial<SentinelConfig> = {}): SentinelConfig => ({
    id: "test-sentinel",
    name: "Test Sentinel",
    model: "anthropic/claude-haiku-4-5",
    trigger: { type: "event", on: ["assistant.action"] },
    execution: { strategy: "immediate" },
    userPromptText: "Test prompt",
    ...overrides,
  });

  beforeEach(() => {
    logger = new MockLogger();
  });

  afterEach(() => {
    // Restore environment
    if (originalToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  test("returns null when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const result = createAgentSdkSentinelFallback([makeConfig()], logger);
    expect(result).toBeNull();
  });

  test("returns null when no OAuth token exists", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const result = createAgentSdkSentinelFallback([makeConfig()], logger);
    expect(result).toBeNull();
  });

  test("returns null when no anthropic models in configs", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const configs = [
      makeConfig({ id: "openai-sentinel", model: "openai/gpt-4o-mini" }),
    ];

    const result = createAgentSdkSentinelFallback(configs, logger);
    expect(result).toBeNull();
  });

  test("returns fallback when OAuth exists and no API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const result = createAgentSdkSentinelFallback([makeConfig()], logger);
    expect(result).not.toBeNull();
    expect(typeof result!.llmCallFn).toBe("function");
    expect(typeof result!.dispose).toBe("function");

    // Verify log message
    const fallbackLog = logger.logs.find(
      (l) => l.message.includes("Creating OAuth fallback"),
    );
    expect(fallbackLog).toBeDefined();

    result!.dispose();
  });

  test("dispatcher throws for non-anthropic sentinels", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const configs = [
      makeConfig({ id: "anthropic-sentinel", model: "anthropic/claude-haiku-4-5" }),
      makeConfig({ id: "openai-sentinel", model: "openai/gpt-4o-mini" }),
    ];

    const result = createAgentSdkSentinelFallback(configs, logger);
    expect(result).not.toBeNull();

    // Non-anthropic sentinel should throw
    try {
      await result!.llmCallFn("openai-sentinel", { messages: [] });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toBe("No LLM provider available");
    }

    result!.dispose();
  });

  test("dispose clears all provider sessions", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const configs = [
      makeConfig({ id: "sentinel-1", model: "anthropic/claude-haiku-4-5" }),
      makeConfig({ id: "sentinel-2", model: "anthropic/claude-sonnet-4-5" }),
    ];

    const result = createAgentSdkSentinelFallback(configs, logger);
    expect(result).not.toBeNull();

    // dispose should not throw
    expect(() => result!.dispose()).not.toThrow();

    // Calling dispose again should be safe
    expect(() => result!.dispose()).not.toThrow();
  });

  test("creates separate providers for different anthropic models", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

    const configs = [
      makeConfig({ id: "haiku-sentinel", model: "anthropic/claude-haiku-4-5" }),
      makeConfig({ id: "sonnet-sentinel", model: "anthropic/claude-sonnet-4-5" }),
    ];

    const result = createAgentSdkSentinelFallback(configs, logger);
    expect(result).not.toBeNull();

    // Both anthropic sentinels should be in the config map
    // Verify by checking that the fallback was created for 2 sentinels
    const fallbackLog = logger.logs.find(
      (l) => l.message.includes("2 anthropic sentinel(s)"),
    );
    expect(fallbackLog).toBeDefined();

    result!.dispose();
  });
});
