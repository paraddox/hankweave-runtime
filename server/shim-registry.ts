/**
 * Shim Plugin Registry
 *
 * Makes the shim system extensible by allowing custom shim registration
 * through hank configuration. Instead of hardcoding provider-to-shim mappings,
 * the registry can be extended at runtime.
 *
 * Built-in shims:
 * - gemini: Google Gemini CLI wrapper
 * - codex: OpenAI Codex SDK wrapper
 * - headless: Direct LLM API wrapper with configurable tools
 *
 * Custom shims can be registered via hank.json:
 * ```json
 * {
 *   "overrides": {
 *     "shims": {
 *       "custom-provider": "./path/to/custom-shim/index.js"
 *     }
 *   }
 * }
 * ```
 */

import fs from "node:fs";
import path from "node:path";
import type { Logger } from "./utils.js";

/**
 * Built-in provider-to-shim name mappings.
 */
const BUILTIN_SHIM_MAP: Record<string, string> = {
  google: "gemini",
  openai: "codex",
  headless: "headless",
};

/**
 * Registry entry for a shim.
 */
export interface ShimRegistryEntry {
  /** Shim name (used to locate the shim file) */
  shimName: string;
  /** Optional custom path to the shim (overrides default resolution) */
  customPath?: string;
  /** Whether this is a built-in shim */
  isBuiltin: boolean;
}

/**
 * ShimRegistry manages the mapping from provider IDs to shim implementations.
 * It supports both built-in shims and custom shims registered via configuration.
 */
export class ShimRegistry {
  private static instance: ShimRegistry | null = null;
  private entries = new Map<string, ShimRegistryEntry>();
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;

    // Register built-in shims
    for (const [providerId, shimName] of Object.entries(BUILTIN_SHIM_MAP)) {
      this.entries.set(providerId.toLowerCase(), {
        shimName,
        isBuiltin: true,
      });
    }
  }

  /**
   * Get or create singleton instance.
   */
  static getInstance(logger?: Logger): ShimRegistry {
    if (!ShimRegistry.instance) {
      ShimRegistry.instance = new ShimRegistry(logger);
    }
    return ShimRegistry.instance;
  }

  /**
   * Reset singleton (for testing).
   */
  static reset(): void {
    ShimRegistry.instance = null;
  }

  /**
   * Register a custom shim for a provider.
   *
   * @param providerId - The provider ID to map (e.g., "custom-provider")
   * @param shimConfig - Either a shim name (to use standard resolution) or a path to a custom shim
   */
  register(providerId: string, shimConfig: string): void {
    const key = providerId.toLowerCase();

    // Determine if this is a path or a shim name
    const isPath = shimConfig.includes("/") || shimConfig.includes("\\") || shimConfig.endsWith(".js") || shimConfig.endsWith(".ts");

    const entry: ShimRegistryEntry = isPath
      ? {
          shimName: key,
          customPath: shimConfig,
          isBuiltin: false,
        }
      : {
          shimName: shimConfig,
          isBuiltin: false,
        };

    this.entries.set(key, entry);
    this.logger?.log(`Registered custom shim for provider '${providerId}': ${shimConfig}`);
  }

  /**
   * Register multiple custom shims from a configuration object.
   *
   * @param shims - Record of provider ID to shim path/name
   */
  registerAll(shims: Record<string, string>): void {
    for (const [providerId, shimConfig] of Object.entries(shims)) {
      this.register(providerId, shimConfig);
    }
  }

  /**
   * Resolve a provider ID to a shim name.
   * Returns undefined if no shim is registered for the provider.
   */
  resolve(providerId: string): string | undefined {
    const entry = this.entries.get(providerId.toLowerCase());
    return entry?.shimName;
  }

  /**
   * Get the full registry entry for a provider.
   * Includes custom path information if available.
   */
  getEntry(providerId: string): ShimRegistryEntry | undefined {
    return this.entries.get(providerId.toLowerCase());
  }

  /**
   * Get a custom shim path if one is registered.
   * Returns undefined for built-in shims or if no custom path is set.
   */
  getCustomPath(providerId: string): string | undefined {
    const entry = this.entries.get(providerId.toLowerCase());
    return entry?.customPath;
  }

  /**
   * Check if a provider has a registered shim.
   */
  hasShim(providerId: string): boolean {
    return this.entries.has(providerId.toLowerCase());
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get all registered shim entries.
   */
  getAllEntries(): Map<string, ShimRegistryEntry> {
    return new Map(this.entries);
  }

  /**
   * Resolve a custom shim path relative to a base directory.
   * For custom shims, resolves the path. For built-in shims, returns undefined.
   *
   * @param providerId - Provider ID
   * @param basePath - Base directory for resolving relative paths
   * @returns Absolute path to the custom shim, or undefined for built-in shims
   */
  resolveCustomShimPath(providerId: string, basePath: string): string | undefined {
    const entry = this.entries.get(providerId.toLowerCase());
    if (!entry?.customPath) return undefined;

    const resolvedPath = path.isAbsolute(entry.customPath)
      ? entry.customPath
      : path.resolve(basePath, entry.customPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger?.log(
        `Warning: Custom shim path does not exist: ${resolvedPath}`,
        "error",
      );
    }

    return resolvedPath;
  }
}
