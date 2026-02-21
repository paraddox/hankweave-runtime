import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  HankweaveGenerateTextOptions,
  HankweaveGenerateTextResult,
} from "../types/llm-call-types.js";
import type { Logger } from "../utils.js";

/**
 * Wraps the Claude Agent SDK to provide an `llmCallFn` for sentinels.
 *
 * Used as a fallback when no API key is configured but OAuth authentication
 * is available (e.g. Claude Code logged in). Each sentinel LLM call spawns
 * a Claude Code subprocess via the Agent SDK's `query()` function.
 *
 * For conversational sentinels, session IDs are stored and `resume` is used
 * on subsequent calls to maintain conversation context.
 *
 * Priority order: API key (fast, Vercel AI SDK) → Agent SDK via OAuth (this) → skip sentinel
 */
export class AgentSdkLlmProvider {
  private sessionIds: Map<string, string> = new Map();

  constructor(
    private modelId: string,
    private logger?: Logger,
  ) {}

  /**
   * Create an llmCallFn closure for use by sentinels.
   *
   * Returns a function matching the sentinel llmCallFn signature that routes
   * LLM calls through the Claude Agent SDK instead of the Vercel AI SDK.
   */
  createLlmCallFn(): (
    sentinelId: string,
    options: HankweaveGenerateTextOptions,
  ) => Promise<HankweaveGenerateTextResult> {
    return async (
      sentinelId: string,
      options: HankweaveGenerateTextOptions,
    ): Promise<HankweaveGenerateTextResult> => {
      // Extract prompt from the last user message
      const lastUserMessage = [...(options.messages || [])].reverse().find((m) => m.role === "user");
      let prompt = "";
      if (lastUserMessage) {
        const content = lastUserMessage.content;
        if (typeof content === "string") {
          prompt = content;
        } else if (Array.isArray(content)) {
          // Extract text parts from content array
          prompt = content
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        }
      }

      if (!prompt) {
        throw new Error(`No user message found in sentinel ${sentinelId} LLM call`);
      }

      // Build SDK options
      const sdkOptions: Options = {
        model: this.modelId,
        maxTurns: 1,
        allowedTools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
      };

      // Handle system prompt
      if (options.system) {
        sdkOptions.systemPrompt = {
          type: "preset",
          preset: "claude_code",
          append: options.system,
        };
      }

      // Handle session resumption for conversational sentinels
      const existingSessionId = this.sessionIds.get(sentinelId);
      if (existingSessionId) {
        sdkOptions.resume = existingSessionId;
        sdkOptions.continue = true;
        this.logger?.log(
          `[AgentSdkLlmProvider] Resuming session ${existingSessionId} for sentinel ${sentinelId}`,
          "debug",
        );
      }

      this.logger?.log(
        `[AgentSdkLlmProvider] Calling query() for sentinel ${sentinelId} (model: ${this.modelId})`,
        "info",
      );

      // Call query() and collect results
      let text = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let sessionCaptured = false;

      const generator = query({ prompt, options: sdkOptions });

      for await (const message of generator) {
        // Store session ID from first message
        if (!sessionCaptured && message.session_id) {
          this.sessionIds.set(sentinelId, message.session_id);
          sessionCaptured = true;
          this.logger?.log(
            `[AgentSdkLlmProvider] Captured session ${message.session_id} for sentinel ${sentinelId}`,
            "debug",
          );
        }

        // Collect text from assistant messages
        if (message.type === "assistant") {
          const assistantMessage = message as SDKMessage & {
            type: "assistant";
            message: { content: Array<{ type: string; text?: string }> };
          };
          if (assistantMessage.message?.content) {
            for (const block of assistantMessage.message.content) {
              if (block.type === "text" && block.text) {
                text += block.text;
              }
            }
          }
        }

        // Collect usage from result messages
        if (message.type === "result") {
          const resultMessage = message as SDKMessage & {
            type: "result";
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (resultMessage.usage) {
            inputTokens = resultMessage.usage.input_tokens ?? 0;
            outputTokens = resultMessage.usage.output_tokens ?? 0;
          }
        }
      }

      // Estimate usage if not available from result
      if (inputTokens === 0 && outputTokens === 0) {
        inputTokens = Math.ceil(prompt.length / 4);
        outputTokens = Math.ceil(text.length / 4);
      }

      this.logger?.log(
        `[AgentSdkLlmProvider] Sentinel ${sentinelId} response: ${text.length} chars, ${inputTokens}/${outputTokens} tokens`,
        "debug",
      );

      return {
        text,
        finishReason: "stop",
        usage: { inputTokens, outputTokens },
      };
    };
  }

  /**
   * Remove stored session ID for a specific sentinel.
   */
  clearSession(sentinelId: string): void {
    this.sessionIds.delete(sentinelId);
  }

  /**
   * Clear all stored session IDs (called on shutdown).
   */
  clearAllSessions(): void {
    this.sessionIds.clear();
  }

  /**
   * Check if OAuth authentication is available.
   *
   * Returns true if CLAUDE_CODE_OAUTH_TOKEN is set in the environment,
   * indicating the user is authenticated via Claude Code OAuth.
   */
  static hasOAuthAuth(): boolean {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return true;
    return false;
  }
}
