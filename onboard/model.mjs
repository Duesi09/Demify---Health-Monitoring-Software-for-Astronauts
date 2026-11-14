// @ts-check
/**
 * Client for the local model server (contract: onboard/model.d.mts).
 *
 * Speaks the OpenAI-compatible HTTP API under DEMIFY_MODEL_URL (Ollama:
 * http://model:11434/v1), so the server can be swapped for vLLM, llama.cpp
 * or TensorRT-LLM without code changes:
 *
 *   GET  {modelUrl}/models            -> data[].id
 *   POST {modelUrl}/embeddings        {model, input}  -> data[].embedding (ordered by index)
 *   POST {modelUrl}/chat/completions  {model, messages, temperature, max_tokens, stream: false}
 *                                     -> choices[0].message.content
 *
 * Plain JavaScript on purpose (see onboard/config.mjs): the app, the
 * ingestion CLI and the sync service all import it, the scripts with plain
 * `node`. Node built-ins only (global fetch, AbortSignal.timeout).
 */

/** @typedef {import("./config.d.mts").OnboardConfig} OnboardConfig */
/** @typedef {import("./model.d.mts").ChatMessage} ChatMessage */
/** @typedef {import("./model.d.mts").ModelStatus} ModelStatus */
/** @typedef {"not-configured" | "unreachable" | "timeout" | "http" | "bad-response"} ModelErrorKind */

/** Thrown for HTTP errors, timeouts and malformed responses. */
export class ModelError extends Error {
  /**
   * @param {ModelErrorKind} kind
   * @param {string} message
   * @param {{ status?: number; cause?: unknown }} [opts]
   */
  constructor(kind, message, opts = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "ModelError";
    /** @readonly */
    this.kind = kind;
    /** @readonly @type {number | undefined} */
    this.status = opts.status;
  }
}

/** Default timeout of modelStatus (GET /models). */
const STATUS_TIMEOUT_MS = 3000;
/** Longest error body excerpt kept in a ModelError message. */
const ERROR_BODY_CHARS = 300;

/**
 * Model ids as servers report them: Ollama lists "nomic-embed-text:latest"
 * for a model pulled as "nomic-embed-text"; both name the same model.
 * @param {string} id
 */
function normaliseModelId(id) {
  return id.trim().toLowerCase().replace(/:latest$/, "");
}

/**
 * @param {string[]} available
 * @param {string} wanted
 */
function hasModel(available, wanted) {
  const w = normaliseModelId(wanted);
  return available.some((id) => normaliseModelId(id) === w);
}

/** @param {unknown} err */
function describe(err) {
  if (err instanceof Error) {
    const cause = /** @type {{ cause?: { code?: string; message?: string } }} */ (err).cause;
    const detail = cause?.code ?? cause?.message;
    return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message || err.name;
  }
  return String(err);
}

/** @param {unknown} err */
function isAbort(err) {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * fetch + JSON with a timeout; every failure becomes a ModelError.
 * @param {OnboardConfig} cfg
 * @param {string} path  e.g. "/models"
 * @param {{ method?: "GET" | "POST"; body?: unknown; timeoutMs: number; signal?: AbortSignal; what: string }} opts
 * @returns {Promise<any>}
 */
async function request(cfg, path, opts) {
  if (!cfg.modelUrl) throw new ModelError("not-configured", "no model server configured (DEMIFY_MODEL_URL is not set)");
  const url = `${cfg.modelUrl}${path}`;
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  /** @param {unknown} err */
  const failed = (err) => {
    if (isAbort(err) || signal.aborted) {
      if (opts.signal?.aborted && !timeout.aborted) {
        return new ModelError("timeout", `${opts.what}: request cancelled`, { cause: err });
      }
      return new ModelError("timeout", `${opts.what}: no answer within ${Math.round(opts.timeoutMs / 100) / 10} s`, { cause: err });
    }
    return new ModelError("unreachable", `${opts.what}: model server unreachable at ${cfg.modelUrl} (${describe(err)})`, { cause: err });
  };

  /** @type {Response} */
  let res;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal,
    });
  } catch (err) {
    throw failed(err);
  }

  /** @type {string} */
  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw failed(err);
  }

  if (!res.ok) {
    throw new ModelError("http", `${opts.what}: HTTP ${res.status}${errorDetail(text)}`, { status: res.status });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelError("bad-response", `${opts.what}: the model server did not answer with JSON`);
  }
}

/**
 * The server's error message (OpenAI style {"error":{"message"}} or
 * {"error":"..."}), else the start of the body.
 * @param {string} body
 */
function errorDetail(body) {
  /** @type {string | undefined} */
  let msg;
  try {
    const parsed = JSON.parse(body);
    const e = parsed?.error;
    msg = typeof e === "string" ? e : typeof e?.message === "string" ? e.message : undefined;
  } catch {
    /* not JSON */
  }
  msg ??= body.replace(/\s+/g, " ").trim();
  return msg ? `: ${msg.slice(0, ERROR_BODY_CHARS)}` : "";
}

/* ------------------------------------------------------------------------- */
/* Status                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * GET /models with a short timeout. Never throws.
 * @param {OnboardConfig} cfg
 * @param {number} [timeoutMs]
 * @returns {Promise<ModelStatus>}
 */
export async function modelStatus(cfg, timeoutMs = STATUS_TIMEOUT_MS) {
  /** @type {ModelStatus} */
  const down = { reachable: false, available: [], llmReady: false, embedReady: false };
  if (!cfg.modelUrl) return { ...down, error: "no model server configured (DEMIFY_MODEL_URL is not set)" };
  try {
    const json = await request(cfg, "/models", { timeoutMs, what: "model list" });
    const data = Array.isArray(json?.data) ? json.data : Array.isArray(json?.models) ? json.models : null;
    if (!data) return { ...down, reachable: true, error: "model list: unexpected answer (no data[])" };
    /** @type {string[]} */
    const available = data
      .map((/** @type {any} */ m) => (typeof m === "string" ? m : typeof m?.id === "string" ? m.id : typeof m?.name === "string" ? m.name : null))
      .filter((/** @type {string | null} */ id) => typeof id === "string" && id.length > 0);
    return {
      reachable: true,
      available,
      llmReady: hasModel(available, cfg.llmModel),
      embedReady: hasModel(available, cfg.embedModel),
    };
  } catch (err) {
    return { ...down, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------------- */
/* Embeddings                                                                 */
/* ------------------------------------------------------------------------- */

const QUERY_PREFIX = "search_query: ";
const DOCUMENT_PREFIX = "search_document: ";

/**
 * nomic-embed-text was trained with task prefixes; other models get the raw
 * text unless DEMIFY_EMBED_PREFIXES=true (and =false turns them off for a
 * nomic model too).
 * @param {OnboardConfig} cfg
 */
function usesPrefixes(cfg) {
  const flag = process.env.DEMIFY_EMBED_PREFIXES?.trim().toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return /nomic/i.test(cfg.embedModel);
}

/**
 * Embeds texts (one vector per input, each cfg.embedDim long).
 * @param {OnboardConfig} cfg
 * @param {string[]} texts
 * @param {"query" | "document"} kind
 * @returns {Promise<number[][]>}
 */
export async function embed(cfg, texts, kind) {
  if (!cfg.modelUrl) throw new ModelError("not-configured", "no model server configured (DEMIFY_MODEL_URL is not set)");
  if (!texts.length) return [];
  const prefix = usesPrefixes(cfg) ? (kind === "query" ? QUERY_PREFIX : DOCUMENT_PREFIX) : "";
  const input = texts.map((t) => `${prefix}${t}`);
  const json = await request(cfg, "/embeddings", {
    method: "POST",
    body: { model: cfg.embedModel, input },
    timeoutMs: cfg.embedTimeoutMs,
    what: `embeddings (${cfg.embedModel})`,
  });
  const data = json?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new ModelError(
      "bad-response",
      `embeddings (${cfg.embedModel}): expected ${texts.length} vectors, got ${Array.isArray(data) ? data.length : "none"}`,
    );
  }
  const ordered = [...data].sort((a, b) => Number(a?.index ?? 0) - Number(b?.index ?? 0));
  return ordered.map((item, i) => {
    const v = item?.embedding;
    if (!Array.isArray(v) || v.length !== cfg.embedDim || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
      throw new ModelError(
        "bad-response",
        `embeddings (${cfg.embedModel}): vector ${i} is not ${cfg.embedDim} finite numbers (got ${Array.isArray(v) ? v.length : typeof v})`,
      );
    }
    return /** @type {number[]} */ (v);
  });
}

/* ------------------------------------------------------------------------- */
/* Chat                                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Removes reasoning the model shows before its answer:
 * - <think>…</think> (and <thinking>, <reasoning>) blocks; an unclosed one
 *   at the start means the answer never came;
 * - gpt-oss "harmony" channels, raw (<|channel|>analysis<|message|>…
 *   <|channel|>final<|message|>answer) or with the special tokens stripped
 *   ("analysis…assistantfinal answer");
 * - a leading "analysis:" / "reasoning:" paragraph followed by "final:".
 * @param {string} text
 */
function stripReasoning(text) {
  let t = text.replace(/\r\n?/g, "\n");
  t = t.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  // Unclosed reasoning block: everything after it is reasoning.
  t = t.replace(/<(think|thinking|reasoning)>[\s\S]*$/i, "");
  // A stray closing tag (the opening one was sent as a special token).
  const close = t.search(/<\/(think|thinking|reasoning)>/i);
  if (close !== -1) t = t.slice(t.indexOf(">", close) + 1);

  const finalTag = t.lastIndexOf("<|channel|>final<|message|>");
  if (finalTag !== -1) {
    t = t.slice(finalTag + "<|channel|>final<|message|>".length);
  } else if (/<\|channel\|>\s*analysis/i.test(t)) {
    t = ""; // only reasoning, no final channel
  }
  t = t.replace(/<\|[a-z_]+\|>/gi, "");

  // Greedy up to the last "assistantfinal": the answer follows it.
  const plain = t.match(/^\s*analysis[\s\S]*assistant\s*final\s*:?\s*([\s\S]*)$/i);
  if (plain) t = plain[1];
  else if (/^\s*analysis(?=[A-Z])/.test(t)) {
    t = ""; // "analysisThe user asks…" with no final channel: reasoning only
  } else {
    const labelled = t.match(/^\s*(?:analysis|reasoning|thoughts?)\s*:[\s\S]*?\n\s*(?:final(?: answer)?|answer)\s*:\s*([\s\S]*)$/i);
    if (labelled) t = labelled[1];
  }
  return t.trim();
}

/**
 * One non-streaming chat completion with cfg.llmModel. Returns the assistant
 * text with any reasoning / <think> blocks removed.
 * @param {OnboardConfig} cfg
 * @param {ChatMessage[]} messages
 * @param {{ temperature?: number; maxTokens?: number; signal?: AbortSignal }} [opts]
 * @returns {Promise<string>}
 */
export async function chat(cfg, messages, opts = {}) {
  if (!cfg.modelUrl) throw new ModelError("not-configured", "no model server configured (DEMIFY_MODEL_URL is not set)");
  const json = await request(cfg, "/chat/completions", {
    method: "POST",
    body: {
      model: cfg.llmModel,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    },
    timeoutMs: cfg.llmTimeoutMs,
    signal: opts.signal,
    what: `chat (${cfg.llmModel})`,
  });
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new ModelError("bad-response", `chat (${cfg.llmModel}): no choices[0].message.content in the answer`);
  }
  const answer = stripReasoning(content);
  if (!answer) {
    const finish = json?.choices?.[0]?.finish_reason;
    throw new ModelError(
      "bad-response",
      `chat (${cfg.llmModel}): empty answer${finish === "length" ? " (the token limit ended it during reasoning)" : ""}`,
    );
  }
  return answer;
}
