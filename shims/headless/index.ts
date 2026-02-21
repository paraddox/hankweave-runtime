#!/usr/bin/env node
/**
 * Headless LLM Shim
 *
 * A shim that wraps raw LLM APIs (Anthropic, OpenAI, Google, Groq) with
 * configurable tool sets. Instead of spawning a coding agent (Claude Code,
 * Gemini CLI, Codex), it calls the LLM API directly with a system prompt
 * and tool definitions.
 *
 * This is the key unlock for non-programming hanks: the shim becomes
 * whatever the hank's prompts and tools define.
 *
 * Protocol: Outputs JSONL to stdout matching the hankweave session protocol.
 * Input: Prompt via stdin.
 * CLI: Same interface as other shims (--model, --resume, --tools, etc.)
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type CoreMessage, type LanguageModel } from "ai";
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliArgs {
  model: string;
  provider: string;
  tools: string[];
  maxTokens: number;
  verbose: boolean;
  idleTimeout: number;
  selfTest: boolean;
  version: boolean;
  help: boolean;
  resume?: string;
  appendSystemPrompt?: string;
  debugDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: "",
    provider: "",
    tools: [],
    maxTokens: 8192,
    verbose: false,
    idleTimeout: 120,
    selfTest: false,
    version: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--model":
        args.model = argv[++i];
        break;
      case "--provider":
        args.provider = argv[++i];
        break;
      case "--tools":
        args.tools = argv[++i].split(",").filter(Boolean);
        break;
      case "--max-tokens":
        args.maxTokens = Number(argv[++i]);
        break;
      case "--resume":
        args.resume = argv[++i];
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--append-system-prompt":
        args.appendSystemPrompt = argv[++i];
        break;
      case "--debug-dir":
        args.debugDir = argv[++i];
        break;
      case "--idle-timeout": {
        const val = Number(argv[++i]);
        if (Number.isFinite(val) && val > 0) args.idleTimeout = val;
        break;
      }
      case "--self-test":
        args.selfTest = true;
        break;
      case "--version":
        args.version = true;
        break;
      case "--help":
        args.help = true;
        break;
      case "-p":
        // stdin indicator, always read stdin
        break;
    }
  }

  return args;
}

// =============================================================================
// JSONL Protocol Output
// =============================================================================

function emit(msg: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function generateMsgId(): string {
  return `msg_${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
}

function generateToolUseId(): string {
  return `toolu_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

const NULL_SESSION = "00000000-0000-0000-0000-000000000000";

function emitSystemInit(opts: {
  cwd: string;
  sessionId: string;
  tools: string[];
  model: string;
  provider: string;
}): void {
  const apiKeySourceMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    openai: "OPENAI_API_KEY",
    groq: "GROQ_API_KEY",
  };
  emit({
    type: "system",
    subtype: "init",
    cwd: opts.cwd,
    session_id: opts.sessionId,
    tools: opts.tools,
    model: `${opts.provider}/${opts.model}`,
    permissionMode: "bypassPermissions",
    apiKeySource: apiKeySourceMap[opts.provider] || "env",
    mcp_servers: [],
  });
}

function emitAssistantMessage(opts: {
  model: string;
  provider: string;
  content: Array<Record<string, unknown>>;
  stopReason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}): void {
  emit({
    type: "assistant",
    message: {
      id: generateMsgId(),
      type: "message",
      role: "assistant",
      model: `${opts.provider}/${opts.model}`,
      content: opts.content,
      usage: opts.usage || { input_tokens: 0, output_tokens: 0 },
      stop_reason: opts.stopReason,
    },
  });
}

function emitUserMessage(
  content: Array<Record<string, unknown>>,
): void {
  emit({
    type: "user",
    message: {
      role: "user",
      content,
    },
  });
}

function emitResult(opts: {
  isError: boolean;
  result: string;
  sessionId: string;
  durationMs: number;
  durationApiMs: number;
  numTurns: number;
  usage: { input_tokens: number; output_tokens: number };
}): void {
  emit({
    type: "result",
    subtype: opts.isError ? "error" : "success",
    is_error: opts.isError,
    duration_ms: opts.durationMs,
    duration_api_ms: opts.durationApiMs,
    num_turns: opts.numTurns,
    result: opts.result,
    session_id: opts.sessionId,
    usage: opts.usage,
  });
}

// =============================================================================
// Provider Factory
// =============================================================================

function createProvider(
  providerId: string,
): { provider: ReturnType<typeof createAnthropic> | ReturnType<typeof createOpenAI> | ReturnType<typeof createGoogleGenerativeAI> | ReturnType<typeof createGroq>; apiKeyEnvVar: string } {
  const providerConfigs: Record<string, { envVar: string; factory: (key: string) => unknown }> = {
    anthropic: {
      envVar: "ANTHROPIC_API_KEY",
      factory: (key) => createAnthropic({ apiKey: key }),
    },
    openai: {
      envVar: "OPENAI_API_KEY",
      factory: (key) => createOpenAI({ apiKey: key }),
    },
    google: {
      envVar: "GOOGLE_API_KEY",
      factory: (key) => createGoogleGenerativeAI({ apiKey: key }),
    },
    groq: {
      envVar: "GROQ_API_KEY",
      factory: (key) => createGroq({ apiKey: key }),
    },
  };

  const config = providerConfigs[providerId];
  if (!config) {
    throw new Error(`Unsupported provider: ${providerId}. Supported: ${Object.keys(providerConfigs).join(", ")}`);
  }

  const apiKey = process.env[config.envVar];
  if (!apiKey) {
    throw new Error(`API key not found. Set ${config.envVar} environment variable.`);
  }

  return {
    provider: config.factory(apiKey) as ReturnType<typeof createAnthropic>,
    apiKeyEnvVar: config.envVar,
  };
}

function getLanguageModel(providerId: string, modelId: string): LanguageModel {
  const { provider } = createProvider(providerId);
  // The AI SDK providers expose .languageModel() or can be called directly
  return (provider as unknown as { languageModel: (id: string) => LanguageModel }).languageModel(modelId);
}

// =============================================================================
// Tool Definitions
// =============================================================================

function createToolSet(toolNames: string[], cwd: string): Record<string, ReturnType<typeof tool>> {
  const allTools: Record<string, () => ReturnType<typeof tool>> = {
    Read: () =>
      tool({
        description: "Read a file from the filesystem. Returns file contents.",
        inputSchema: z.object({
          file_path: z.string().describe("Absolute path to the file to read"),
        }),
        execute: async ({ file_path }) => {
          try {
            const resolved = path.isAbsolute(file_path) ? file_path : path.resolve(cwd, file_path);
            return fs.readFileSync(resolved, "utf-8");
          } catch (e) {
            return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    Write: () =>
      tool({
        description: "Write content to a file. Creates directories if needed.",
        inputSchema: z.object({
          file_path: z.string().describe("Absolute path to the file to write"),
          content: z.string().describe("Content to write"),
        }),
        execute: async ({ file_path, content }) => {
          try {
            const resolved = path.isAbsolute(file_path) ? file_path : path.resolve(cwd, file_path);
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            fs.writeFileSync(resolved, content, "utf-8");
            return `File written successfully: ${resolved}`;
          } catch (e) {
            return `Error writing file: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    Edit: () =>
      tool({
        description: "Edit a file by replacing an exact string match with new text.",
        inputSchema: z.object({
          file_path: z.string().describe("Path to the file to edit"),
          old_str: z.string().describe("Exact text to find and replace"),
          new_str: z.string().describe("Replacement text"),
        }),
        execute: async ({ file_path, old_str, new_str }) => {
          try {
            const resolved = path.isAbsolute(file_path) ? file_path : path.resolve(cwd, file_path);
            const content = fs.readFileSync(resolved, "utf-8");
            if (!content.includes(old_str)) {
              return `Error: old_str not found in file. The text to replace must match exactly.`;
            }
            const newContent = content.replace(old_str, new_str);
            fs.writeFileSync(resolved, newContent, "utf-8");
            return `File edited successfully: ${resolved}`;
          } catch (e) {
            return `Error editing file: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    Bash: () =>
      tool({
        description: "Execute a shell command and return the output.",
        inputSchema: z.object({
          command: z.string().describe("Shell command to execute"),
        }),
        execute: async ({ command }) => {
          try {
            const output = execSync(command, {
              cwd,
              timeout: 120000,
              maxBuffer: 1024 * 1024 * 10,
              encoding: "utf-8",
              stdio: ["pipe", "pipe", "pipe"],
            });
            return output || "(no output)";
          } catch (e) {
            const err = e as { stdout?: string; stderr?: string; message?: string };
            return `Command failed: ${err.stderr || err.stdout || err.message || String(e)}`;
          }
        },
      }),

    LS: () =>
      tool({
        description: "List directory contents.",
        inputSchema: z.object({
          path: z.string().describe("Directory path to list").default("."),
        }),
        execute: async ({ path: dirPath }) => {
          try {
            const resolved = path.isAbsolute(dirPath) ? dirPath : path.resolve(cwd, dirPath);
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            return entries
              .map((e) => `${e.isDirectory() ? "[dir] " : ""}${e.name}`)
              .join("\n");
          } catch (e) {
            return `Error listing directory: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    Glob: () =>
      tool({
        description: "Find files matching a glob pattern.",
        inputSchema: z.object({
          pattern: z.string().describe("Glob pattern (e.g., '**/*.md')"),
        }),
        execute: async ({ pattern }) => {
          try {
            // Use simple recursive walk with minimatch
            const results: string[] = [];
            function walk(dir: string): void {
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  const full = path.join(dir, entry.name);
                  if (entry.isDirectory() && !entry.name.startsWith(".")) {
                    walk(full);
                  } else if (entry.isFile()) {
                    results.push(path.relative(cwd, full));
                  }
                }
              } catch {
                // Skip unreadable directories
              }
            }
            walk(cwd);

            // Simple pattern matching (supports *, **, ?)
            const regex = globToRegex(pattern);
            const matched = results.filter((f) => regex.test(f));
            return matched.length > 0
              ? matched.slice(0, 200).join("\n")
              : "No files matched the pattern.";
          } catch (e) {
            return `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    Grep: () =>
      tool({
        description: "Search for a pattern in file contents. Returns matching lines.",
        inputSchema: z.object({
          pattern: z.string().describe("Search pattern (regex)"),
          path: z.string().describe("File or directory to search in").optional(),
        }),
        execute: async ({ pattern, path: searchPath }) => {
          try {
            const target = searchPath
              ? path.isAbsolute(searchPath)
                ? searchPath
                : path.resolve(cwd, searchPath)
              : cwd;
            // Use grep command for efficiency
            const output = execSync(
              `grep -rn --include='*' -E ${JSON.stringify(pattern)} ${JSON.stringify(target)} 2>/dev/null | head -100`,
              { cwd, encoding: "utf-8", timeout: 30000, maxBuffer: 1024 * 1024 },
            );
            return output || "No matches found.";
          } catch {
            return "No matches found.";
          }
        },
      }),

    WebFetch: () =>
      tool({
        description: "Fetch content from a URL and return it as text.",
        inputSchema: z.object({
          url: z.string().describe("URL to fetch"),
        }),
        execute: async ({ url }) => {
          try {
            const response = await fetch(url, {
              headers: { "User-Agent": "HankweaveHeadlessShim/1.0" },
              signal: AbortSignal.timeout(30000),
            });
            if (!response.ok) {
              return `HTTP ${response.status}: ${response.statusText}`;
            }
            const text = await response.text();
            // Truncate to avoid overwhelming context
            return text.length > 50000 ? `${text.slice(0, 50000)}\n\n[Truncated - ${text.length} total chars]` : text;
          } catch (e) {
            return `Error fetching URL: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }),

    WebSearch: () =>
      tool({
        description: "Search the web for information. Returns search results.",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
        }),
        execute: async ({ query }) => {
          // WebSearch requires a search API. For now, provide a helpful message.
          return `Web search is not available in headless mode. Consider using WebFetch with a specific URL instead. Query was: "${query}"`;
        },
      }),
  };

  const toolSet: Record<string, ReturnType<typeof tool>> = {};

  // If no tools specified, use a sensible default set
  const selectedTools = toolNames.length > 0 ? toolNames : ["Read", "Write", "Edit", "Bash", "LS", "Glob", "Grep"];

  for (const name of selectedTools) {
    const factory = allTools[name];
    if (factory) {
      toolSet[name] = factory();
    }
  }

  return toolSet;
}

/** Convert a simple glob pattern to a RegExp */
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`);
}

// =============================================================================
// Session Persistence (for --resume support)
// =============================================================================

interface SessionData {
  sessionId: string;
  messages: CoreMessage[];
  systemPrompt?: string;
}

function getSessionPath(debugDir: string, sessionId: string): string {
  return path.join(debugDir, `session-${sessionId}.json`);
}

function saveSession(debugDir: string, session: SessionData): void {
  try {
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(
      getSessionPath(debugDir, session.sessionId),
      JSON.stringify(session, null, 2),
      "utf-8",
    );
  } catch {
    // Non-critical: session persistence failure shouldn't stop execution
  }
}

function loadSession(debugDir: string, sessionId: string): SessionData | null {
  try {
    const data = fs.readFileSync(getSessionPath(debugDir, sessionId), "utf-8");
    return JSON.parse(data) as SessionData;
  } catch {
    return null;
  }
}

// =============================================================================
// Main Execution Loop
// =============================================================================

async function run(prompt: string, args: CliArgs): Promise<{ exitCode: number; sessionId: string }> {
  const startTime = Date.now();
  let apiStartTime = 0;
  let apiEndTime = 0;
  let numTurns = 0;
  const totalUsage = { input_tokens: 0, output_tokens: 0 };
  let isError = false;
  let resultMessage = "";
  let sessionInitEmitted = false;

  // Resolve provider and model
  let providerId = args.provider;
  let modelId = args.model;

  // If model contains provider prefix (e.g., "anthropic/claude-sonnet-4-6"), split it
  if (!providerId && modelId.includes("/")) {
    const parts = modelId.split("/", 2);
    providerId = parts[0];
    modelId = parts[1];
  }

  if (!providerId) {
    // Infer provider from model name
    const lower = modelId.toLowerCase();
    if (lower.includes("claude")) providerId = "anthropic";
    else if (lower.includes("gemini")) providerId = "google";
    else if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("o3")) providerId = "openai";
    else providerId = "anthropic"; // default
  }

  // Generate or resume session
  const sessionId = args.resume || randomUUID();
  const debugDir = args.debugDir || path.join(process.cwd(), ".hankweave", "headless-sessions");

  // Build system prompt
  const systemParts: string[] = [];
  systemParts.push(
    "You are a helpful assistant working within the Hankweave workflow system. " +
    "You have access to tools for interacting with the filesystem and performing tasks. " +
    "Use tools as needed to accomplish the task described in the user's prompt. " +
    "Always produce your final output as files in the working directory."
  );
  if (args.appendSystemPrompt) {
    systemParts.push(args.appendSystemPrompt);
  }
  const systemPrompt = systemParts.join("\n\n");

  // Build message history
  let messages: CoreMessage[] = [];

  // Resume previous session if requested
  if (args.resume) {
    const prevSession = loadSession(debugDir, args.resume);
    if (prevSession) {
      messages = prevSession.messages;
      if (args.verbose) {
        console.error(`[headless] Resumed session ${args.resume} with ${messages.length} messages`);
      }
    } else if (args.verbose) {
      console.error(`[headless] Session ${args.resume} not found, starting fresh`);
    }
  }

  // Add new user message
  messages.push({ role: "user", content: prompt });

  // Create tool set
  const cwd = process.cwd();
  const toolNames = args.tools;
  const toolSet = createToolSet(toolNames, cwd);

  // Emit system init
  emitSystemInit({
    cwd,
    sessionId,
    tools: Object.keys(toolSet),
    model: modelId,
    provider: providerId,
  });
  sessionInitEmitted = true;

  try {
    // Get language model
    const model = getLanguageModel(providerId, modelId);

    apiStartTime = Date.now();

    // Run the agentic loop using Vercel AI SDK's generateText with maxSteps
    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      tools: toolSet,
      stopWhen: stepCountIs(50),
      maxTokens: args.maxTokens,
      onStepFinish: async (step) => {
        numTurns++;

        // Track token usage
        if (step.usage) {
          totalUsage.input_tokens += step.usage.inputTokens || 0;
          totalUsage.output_tokens += step.usage.outputTokens || 0;
        }

        // Build assistant message content
        const content: Array<Record<string, unknown>> = [];

        // Add text content
        if (step.text) {
          content.push({ type: "text", text: step.text });
        }

        // Add tool calls
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            content.push({
              type: "tool_use",
              id: generateToolUseId(),
              name: tc.toolName,
              input: tc.input,
            });
          }
        }

        // Emit assistant message
        if (content.length > 0) {
          const stopReason = step.toolCalls && step.toolCalls.length > 0 ? "tool_use" : "end_turn";
          emitAssistantMessage({
            model: modelId,
            provider: providerId,
            content,
            stopReason,
            usage: {
              input_tokens: step.usage?.promptTokens || 0,
              output_tokens: step.usage?.completionTokens || 0,
            },
          });
        }

        // Emit tool results
        if (step.toolResults && step.toolResults.length > 0) {
          const toolResultContent: Array<Record<string, unknown>> = [];
          for (const tr of step.toolResults) {
            toolResultContent.push({
              type: "tool_result",
              tool_use_id: generateToolUseId(),
              content: typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output),
            });
          }
          emitUserMessage(toolResultContent);
        }
      },
    });

    apiEndTime = Date.now();

    // If no steps emitted any text, emit the final text
    if (result.text && numTurns === 0) {
      numTurns = 1;
      emitAssistantMessage({
        model: modelId,
        provider: providerId,
        content: [{ type: "text", text: result.text }],
        stopReason: "end_turn",
        usage: {
          input_tokens: result.usage?.inputTokens || 0,
          output_tokens: result.usage?.outputTokens || 0,
        },
      });
      totalUsage.input_tokens += result.usage?.inputTokens || 0;
      totalUsage.output_tokens += result.usage?.outputTokens || 0;
    }

    resultMessage = "Task completed successfully";

    // Save session for potential resume
    // Rebuild messages from the result steps for proper session persistence
    const finalMessages: CoreMessage[] = [...messages];
    if (result.text) {
      finalMessages.push({ role: "assistant", content: result.text });
    }
    saveSession(debugDir, {
      sessionId,
      messages: finalMessages,
      systemPrompt,
    });
  } catch (e) {
    apiEndTime = Date.now();
    isError = true;
    const errorMsg = e instanceof Error ? e.message : String(e);
    resultMessage = `Agent Error: ${errorMsg}`;

    if (!sessionInitEmitted) {
      emitSystemInit({
        cwd,
        sessionId: sessionId || NULL_SESSION,
        tools: Object.keys(toolSet),
        model: modelId,
        provider: providerId,
      });
    }

    emitAssistantMessage({
      model: modelId,
      provider: providerId,
      content: [{ type: "text", text: resultMessage }],
      stopReason: "end_turn",
    });
  }

  const endTime = Date.now();

  emitResult({
    isError,
    result: resultMessage,
    sessionId,
    durationMs: endTime - startTime,
    durationApiMs: apiEndTime > 0 ? apiEndTime - apiStartTime : 0,
    numTurns,
    usage: totalUsage,
  });

  // Flush stdout
  await new Promise<void>((resolve) => {
    process.stdout.write("", () => resolve());
  });

  return { exitCode: isError ? 1 : 0, sessionId };
}

// =============================================================================
// Self-Test
// =============================================================================

async function runSelfTest(args: CliArgs): Promise<void> {
  const checks: Array<{ name: string; passed: boolean; message: string }> = [];

  // Determine provider
  let providerId = args.provider;
  if (!providerId && args.model) {
    if (args.model.includes("/")) {
      providerId = args.model.split("/")[0];
    }
  }

  // Check each supported provider's API key
  const providers = [
    { id: "anthropic", envVar: "ANTHROPIC_API_KEY" },
    { id: "openai", envVar: "OPENAI_API_KEY" },
    { id: "google", envVar: "GOOGLE_API_KEY" },
    { id: "groq", envVar: "GROQ_API_KEY" },
  ];

  let anyKeyFound = false;
  for (const p of providers) {
    const hasKey = !!process.env[p.envVar];
    if (hasKey) anyKeyFound = true;
    // Only report the specific provider if one was specified
    if (!providerId || p.id === providerId) {
      checks.push({
        name: `${p.id}_api_key`,
        passed: hasKey,
        message: hasKey
          ? `${p.envVar} found in environment`
          : `${p.envVar} not found in environment`,
      });
    }
  }

  if (!providerId) {
    checks.push({
      name: "any_api_key",
      passed: anyKeyFound,
      message: anyKeyFound
        ? "At least one API key found"
        : "No API keys found for any provider",
    });
  }

  const allPassed = checks.every((c) => c.passed);

  const result = {
    shim: { name: "headless-llm-shim", version: "1.0.0" },
    agent: { name: "headless-llm", version: "1.0.0", found: true },
    checks,
    overall: {
      passed: allPassed,
      message: allPassed ? "All checks passed" : "Some checks failed",
    },
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(allPassed ? 0 : 1);
}

// =============================================================================
// Stdin Reading
// =============================================================================

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

// =============================================================================
// Help & Version
// =============================================================================

function printHelp(): void {
  console.error(`
Headless LLM Shim - Direct LLM API wrapper with configurable tools

Usage: headless-shim [options]

Required Arguments:
  --model <provider/model>     Model identifier (e.g., anthropic/claude-sonnet-4-6)

Optional Arguments:
  --provider <id>              Provider ID (anthropic, openai, google, groq)
                               Auto-detected from model name if not specified
  --tools <list>               Comma-separated tool names (Read,Write,Edit,Bash,LS,Glob,Grep,WebFetch)
                               Defaults to: Read,Write,Edit,Bash,LS,Glob,Grep
  --max-tokens <number>        Max output tokens per LLM call (default: 8192)
  -p                           Read prompt from stdin
  --resume <session-id>        Resume a previous session
  --append-system-prompt <txt> Additional system prompt text
  --idle-timeout <seconds>     Max seconds between events (default: 120)
  --debug-dir <path>           Directory for debug logs and session data
  --self-test                  Run environment verification
  --version                    Print version and exit
  --help                       Print this help and exit

Examples:
  echo "Summarize this document" | headless-shim --model anthropic/claude-sonnet-4-6 --tools Read,Write
  echo "Fetch and analyze" | headless-shim --model google/gemini-2.0-flash --tools Read,Write,WebFetch
`);
}

// =============================================================================
// Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    console.error("headless-llm-shim v1.0.0");
    process.exit(0);
  }

  if (args.selfTest) {
    await runSelfTest(args);
    return;
  }

  if (!args.model) {
    console.error("Error: --model is required");
    printHelp();
    process.exit(1);
  }

  const prompt = await readStdin();
  if (!prompt) {
    process.exit(0);
  }

  // Handle graceful shutdown
  let interrupted = false;
  const handleSignal = () => {
    if (!interrupted) {
      interrupted = true;
      process.exit(0);
    }
  };
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  try {
    const result = await run(prompt, args);
    process.exit(result.exitCode);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`Fatal error: ${errorMsg}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
