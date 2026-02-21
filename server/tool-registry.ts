/**
 * Tool Registry System
 *
 * Provides configurable tool sets per codon and predefined domain tool packs.
 * Tools are organized into packs that can be referenced by name in hank configurations.
 *
 * Usage in hank.json:
 *   "tools": ["Read", "Write", "WebFetch"]           // Individual tools
 *   "tools": ["@web-research"]                         // Tool pack (prefixed with @)
 *   "tools": ["@web-research", "Bash"]                // Mix of packs and individual tools
 */

/**
 * All available tool names that the headless shim can provide.
 */
export const ALL_TOOL_NAMES = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "LS",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
] as const;

export type HeadlessToolName = (typeof ALL_TOOL_NAMES)[number];

/**
 * Predefined tool packs for different domains.
 * Each pack is a curated set of tools for a specific use case.
 */
export const TOOL_PACKS: Record<string, readonly HeadlessToolName[]> = {
  /** File system tools for reading, writing, and searching files */
  "@filesystem": ["Read", "Write", "Edit", "LS", "Glob", "Grep"],

  /** Web research tools for fetching and searching the web */
  "@web-research": ["WebFetch", "WebSearch", "Read", "Write"],

  /** Data analysis tools for working with data files */
  "@data-analysis": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],

  /** Document processing tools */
  "@document": ["Read", "Write", "Edit", "Glob", "Grep"],

  /** Full tool set - everything available */
  "@all": [...ALL_TOOL_NAMES],

  /** Minimal set - just read and write */
  "@minimal": ["Read", "Write"],

  /** Research-to-publication workflow tools */
  "@research": ["Read", "Write", "Edit", "WebFetch", "WebSearch", "Glob", "Grep"],

  /** Creative content generation tools */
  "@creative": ["Read", "Write", "Edit", "Glob"],
} as const;

/**
 * Default tool set when none is specified.
 */
export const DEFAULT_TOOLS: readonly HeadlessToolName[] = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "LS",
  "Glob",
  "Grep",
];

/**
 * Resolve a tool specification into a flat list of tool names.
 * Handles both individual tool names and tool pack references.
 *
 * @param toolSpec - Array of tool names and/or pack references (e.g., ["@web-research", "Bash"])
 * @returns Deduplicated array of resolved tool names
 */
export function resolveTools(toolSpec: string[]): string[] {
  if (toolSpec.length === 0) {
    return [...DEFAULT_TOOLS];
  }

  const resolved = new Set<string>();

  for (const item of toolSpec) {
    if (item.startsWith("@")) {
      // Tool pack reference
      const pack = TOOL_PACKS[item];
      if (pack) {
        for (const tool of pack) {
          resolved.add(tool);
        }
      } else {
        // Unknown pack - treat as individual tool name (minus the @)
        // This allows future extensibility
        console.warn(`Unknown tool pack: ${item}`);
      }
    } else {
      // Individual tool name
      resolved.add(item);
    }
  }

  return Array.from(resolved);
}

/**
 * Validate that all tool names in a specification are valid.
 *
 * @param toolSpec - Array of tool names and/or pack references
 * @returns Object with valid flag and any invalid tool names
 */
export function validateToolSpec(toolSpec: string[]): {
  valid: boolean;
  invalidTools: string[];
  invalidPacks: string[];
} {
  const invalidTools: string[] = [];
  const invalidPacks: string[] = [];
  const allToolSet = new Set<string>(ALL_TOOL_NAMES);
  const allPackSet = new Set<string>(Object.keys(TOOL_PACKS));

  for (const item of toolSpec) {
    if (item.startsWith("@")) {
      if (!allPackSet.has(item)) {
        invalidPacks.push(item);
      }
    } else if (!allToolSet.has(item)) {
      invalidTools.push(item);
    }
  }

  return {
    valid: invalidTools.length === 0 && invalidPacks.length === 0,
    invalidTools,
    invalidPacks,
  };
}

/**
 * Get a human-readable description of available tool packs.
 */
export function getToolPackDescriptions(): Record<string, string> {
  return {
    "@filesystem": "File system tools (Read, Write, Edit, LS, Glob, Grep)",
    "@web-research": "Web research tools (WebFetch, WebSearch, Read, Write)",
    "@data-analysis": "Data analysis tools (Read, Write, Edit, Bash, Glob, Grep)",
    "@document": "Document processing tools (Read, Write, Edit, Glob, Grep)",
    "@all": "All available tools",
    "@minimal": "Minimal set (Read, Write)",
    "@research": "Research workflow tools (Read, Write, Edit, WebFetch, WebSearch, Glob, Grep)",
    "@creative": "Creative content tools (Read, Write, Edit, Glob)",
  };
}
