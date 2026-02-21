import { CodonRunner } from "../codon-runner.js";
import type { LlmProviderRegistry } from "../llm/llm-provider-registry.js";
import type { ModelInfo } from "../llm/models-dev-schema.js";
import { ShimRegistry } from "../shim-registry.js";

/**
 * Result of model validation
 */
export interface ModelValidationResult {
  /** Whether the model is valid and can be used */
  valid: boolean;
  /** The resolved ModelInfo if validation succeeded */
  modelInfo?: ModelInfo;
  /** Human-readable reason if validation failed */
  reason?: string;
  /** Type of match that was found (if any) */
  matchType?: "exact" | "exact-with-inferred-provider" | "fuzzy";
}

/**
 * Check if a model string uses the headless prefix.
 * Headless models use the format "headless:provider/model".
 */
export function isHeadlessModel(model: string): boolean {
  return model.startsWith("headless:");
}

/**
 * Strip the headless prefix from a model string.
 * "headless:anthropic/claude-sonnet-4-6" → "anthropic/claude-sonnet-4-6"
 */
export function stripHeadlessPrefix(model: string): string {
  return model.replace(/^headless:/, "");
}

/**
 * Validates a model string against the LLM registry and CodonRunner capabilities.
 *
 * Validation steps:
 * 1. Handle headless: prefix (strip it, resolve the actual model, then wrap as headless)
 * 2. Resolve the model using LLMProviderRegistry.resolveModel()
 * 3. Check if the resolved model can be run by CodonRunner.canRun()
 *
 * @param model - The model string to validate (e.g., "sonnet", "gemini-2.0-flash-exp", "headless:anthropic/claude-sonnet-4-6")
 * @param registry - The LLMProviderRegistry instance to use for resolution
 * @param providerId - Optional provider ID to narrow the search (e.g., "anthropic", "google")
 * @returns ModelValidationResult with validation outcome
 */
export function validateModel(
  model: string,
  registry: LlmProviderRegistry,
  providerId?: string,
): ModelValidationResult {
  // Handle headless: prefix
  const headless = isHeadlessModel(model);
  const actualModel = headless ? stripHeadlessPrefix(model) : model;

  // Step 1: Resolve the actual model via registry
  const resolveResult = registry.resolveModel({
    model: actualModel,
    providerId,
    ignoreBlockList: true, // Config validation should not be affected by runtime blocklists
  });

  // If resolution failed, return the reason
  if (!resolveResult.success) {
    let reason: string;

    if (resolveResult.reason === "model-not-found") {
      reason = `Model '${actualModel}' not found in registry. Please check the model name or ensure the provider is configured.`;
    } else {
      reason = `Model '${actualModel}' is blocked`;
    }

    return {
      valid: false,
      reason,
    };
  }

  // For headless models, create a synthetic ModelInfo with "headless" as the providerId
  // but preserve the actual provider/model info in the modelId
  if (headless) {
    const headlessModelInfo: ModelInfo = {
      ...resolveResult.modelInfo,
      // Store the actual provider/model as a compound ID for the headless shim to parse
      providerId: "headless",
      modelId: `${resolveResult.modelInfo.providerId}/${resolveResult.modelInfo.modelId}`,
    };

    return {
      valid: true,
      modelInfo: headlessModelInfo,
      matchType: resolveResult.matchType,
    };
  }

  // Step 2: Check if CodonRunner can execute this model
  // First check built-in support, then check the shim registry for custom shims
  const canRun = CodonRunner.canRun(resolveResult.modelInfo);
  const shimRegistry = ShimRegistry.getInstance();
  const hasCustomShim = shimRegistry.hasShim(resolveResult.modelInfo.providerId);

  if (!canRun && !hasCustomShim) {
    const builtinProviders = ["anthropic", "google", "openai"];
    const customProviders = shimRegistry.getRegisteredProviders().filter(
      (p) => !builtinProviders.includes(p) && p !== "headless",
    );
    const allProviders = [...builtinProviders, ...customProviders];
    const providerName = resolveResult.modelInfo.providerId;
    return {
      valid: false,
      modelInfo: resolveResult.modelInfo,
      reason: `Model '${model}' uses provider '${providerName}' which is not currently supported. Supported providers: ${allProviders.join(", ")}. You can also use 'headless:${model}' for direct LLM API access, or register a custom shim via overrides.shims.`,
      matchType: resolveResult.matchType,
    };
  }

  // Validation successful
  return {
    valid: true,
    modelInfo: resolveResult.modelInfo,
    matchType: resolveResult.matchType,
  };
}
