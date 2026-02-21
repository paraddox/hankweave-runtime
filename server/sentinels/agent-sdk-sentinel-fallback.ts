import { AgentSdkLlmProvider } from "./agent-sdk-llm-provider.js";
import type { SentinelConfig } from "../types/sentinel-types.js";
import type {
  HankweaveGenerateTextOptions,
  HankweaveGenerateTextResult,
} from "../types/llm-call-types.js";
import type { Logger } from "../utils.js";

export interface AgentSdkSentinelFallback {
  llmCallFn: (
    sentinelId: string,
    options: HankweaveGenerateTextOptions,
  ) => Promise<HankweaveGenerateTextResult>;
  dispose: () => void;
}

/**
 * Factory that creates a smart `llmCallOverride` dispatcher for sentinel LLM calls
 * when no API key is configured but OAuth authentication is available.
 *
 * Returns null if:
 * - ANTHROPIC_API_KEY is set (real providers should be used instead)
 * - No OAuth token exists
 * - No configs use anthropic/ models
 *
 * When active, routes anthropic model calls through AgentSdkLlmProvider instances
 * and throws for non-anthropic models (same behavior as "no provider available").
 */
export function createAgentSdkSentinelFallback(
  configs: SentinelConfig[],
  logger?: Logger,
): AgentSdkSentinelFallback | null {
  // Don't use fallback if API key exists — real providers handle it
  if (process.env.ANTHROPIC_API_KEY) {
    return null;
  }

  // Don't use fallback if no OAuth auth available
  if (!AgentSdkLlmProvider.hasOAuthAuth()) {
    return null;
  }

  // Build map of sentinelId → modelId for anthropic models only
  const sentinelModelMap = new Map<string, string>();
  for (const config of configs) {
    if (config.model?.startsWith("anthropic/")) {
      // Extract model ID after "anthropic/" prefix
      const agentModelId = config.model.split("/").slice(1).join("/");
      sentinelModelMap.set(config.id, agentModelId);
    }
  }

  // No anthropic sentinels → no need for fallback
  if (sentinelModelMap.size === 0) {
    return null;
  }

  logger?.log(
    `[AgentSdkSentinelFallback] Creating OAuth fallback for ${sentinelModelMap.size} anthropic sentinel(s)`,
    "info",
  );

  // Lazily created per-model providers
  const providers = new Map<string, AgentSdkLlmProvider>();

  const getOrCreateProvider = (modelId: string): AgentSdkLlmProvider => {
    let provider = providers.get(modelId);
    if (!provider) {
      provider = new AgentSdkLlmProvider(modelId, logger);
      providers.set(modelId, provider);
      logger?.log(
        `[AgentSdkSentinelFallback] Created Agent SDK OAuth fallback provider (model: ${modelId})`,
        "info",
      );
    }
    return provider;
  };

  const llmCallFn = async (
    sentinelId: string,
    options: HankweaveGenerateTextOptions,
  ): Promise<HankweaveGenerateTextResult> => {
    const modelId = sentinelModelMap.get(sentinelId);
    if (!modelId) {
      throw new Error("No LLM provider available");
    }

    const provider = getOrCreateProvider(modelId);
    const callFn = provider.createLlmCallFn();
    return callFn(sentinelId, options);
  };

  const dispose = (): void => {
    for (const provider of providers.values()) {
      provider.clearAllSessions();
    }
    providers.clear();
  };

  return { llmCallFn, dispose };
}
