/**
 * Client for the local model server. Speaks the OpenAI-compatible HTTP API
 * (GET /models, POST /embeddings, POST /chat/completions under
 * DEMIFY_MODEL_URL, e.g. http://model:11434/v1 for Ollama), so the server
 * can be swapped for vLLM, llama.cpp or TensorRT-LLM without code changes.
 */
import type { OnboardConfig } from "./config.mjs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelStatus {
  /** The server answered GET /models. */
  reachable: boolean;
  /** Model ids the server reports (e.g. "gpt-oss:20b"). */
  available: string[];
  /** cfg.llmModel is among them. */
  llmReady: boolean;
  /** cfg.embedModel is among them. */
  embedReady: boolean;
  error?: string;
}

/** Thrown for HTTP errors, timeouts and malformed responses. */
export class ModelError extends Error {
  readonly kind: "not-configured" | "unreachable" | "timeout" | "http" | "bad-response";
  readonly status?: number;
}

/**
 * Embeds texts. kind adds the task prefix nomic-embed-text expects
 * ("search_query: " / "search_document: "); other models get the raw text
 * unless DEMIFY_EMBED_PREFIXES=true. Returns one vector per input, each of
 * length cfg.embedDim (else ModelError "bad-response").
 */
export function embed(cfg: OnboardConfig, texts: string[], kind: "query" | "document"): Promise<number[][]>;

/**
 * One non-streaming chat completion with cfg.llmModel. Returns the assistant
 * text with any reasoning / <think> blocks removed.
 */
export function chat(
  cfg: OnboardConfig,
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; signal?: AbortSignal },
): Promise<string>;

/** GET /models with a short timeout. Never throws. */
export function modelStatus(cfg: OnboardConfig, timeoutMs?: number): Promise<ModelStatus>;
