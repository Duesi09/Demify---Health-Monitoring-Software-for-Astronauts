#!/usr/bin/env node
// @ts-check
/**
 * FAKE model server: a development and test tool only. It is NOT a language
 * model and NOT an embedding model, never part of the compose stack, and
 * never to be shown or described as a real model. It exists because the
 * model registry is not reachable on development machines and in CI.
 *
 * It speaks the same OpenAI-compatible API as Ollama / vLLM under /v1, so
 * onboard/model.mjs can be exercised end to end:
 *
 *   GET  /v1/models             the fake ids (FAKE_MODELS, default "gpt-oss:20b,nomic-embed-text")
 *   POST /v1/embeddings         deterministic unit vectors (FAKE_EMBED_DIM, default 768) built from
 *                               hashed word features, so texts that share words get similar vectors.
 *                               Similarities are NOT calibrated like a real embedding model: they are
 *                               lower (related passages about 0.3, unrelated below 0.2), so set
 *                               DEMIFY_ASSISTANT_MIN_SCORE=0.25 when the app talks to this server.
 *                               Results come back in reverse order on purpose (clients must order by index).
 *   POST /v1/chat/completions   a templated answer from passage [1] (the earliest "[n] ..." block) in the
 *                               last user message: "According to the library, <sentence> [1].", where
 *                               <sentence> is the sentence of that passage sharing the most words with
 *                               the "Question:" line (the earliest on a tie).
 *                               With no passage in the message it answers exactly NO_ANSWER.
 *                               The answer starts with a <think>…</think> block (FAKE_THINK=false turns
 *                               it off), as some reasoning models send, to exercise the client's stripping.
 *
 * Usage:  node scripts/dev/fake-model-server.mjs [--port 11555] [--host 127.0.0.1]
 *         (npm run model:fake). --port 0 picks a free port; stdout starts with the line
 *         "fake model server listening on http://<host>:<port>/v1".
 *
 * Environment:
 *   FAKE_MODELS     comma-separated model ids listed and accepted (others answer 404 like Ollama)
 *   FAKE_EMBED_DIM  embedding width (default 768)
 *   FAKE_DELAY_MS   delay before every answer (simulates a slow or overloaded server)
 *   FAKE_FAIL       chat | embed | all (comma-separated): those endpoints answer HTTP 500
 *   FAKE_THINK      false = no <think> block in chat answers
 *   FAKE_TRIGRAM_WEIGHT  weight of character-trigram features against whole words (default 0.05)
 */
import { createServer } from "node:http";

/** @param {string} name @param {string} fallback */
function arg(name, fallback) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] !== undefined) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return fallback;
}

const PORT = Number(arg("port", process.env.FAKE_PORT ?? "11555"));
const HOST = arg("host", process.env.FAKE_HOST ?? "127.0.0.1");
const MODELS = (process.env.FAKE_MODELS ?? "gpt-oss:20b,nomic-embed-text")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DIM = Math.max(1, Math.floor(Number(process.env.FAKE_EMBED_DIM ?? "768")) || 768);
const DELAY_MS = Math.max(0, Number(process.env.FAKE_DELAY_MS ?? "0") || 0);
const FAIL = new Set(
  (process.env.FAKE_FAIL ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const THINK = (process.env.FAKE_THINK ?? "true").trim().toLowerCase() !== "false";
const MAX_BODY = 10 * 1024 * 1024;

/** @param {string} id */
const norm = (id) => id.trim().toLowerCase().replace(/:latest$/, "");
/** @param {unknown} id */
const known = (id) => typeof id === "string" && MODELS.some((m) => norm(m) === norm(id));

/* ------------------------------------------------------------------------- */
/* Hashed bag-of-words embeddings                                             */
/* ------------------------------------------------------------------------- */

const STOPWORDS = new Set(
  "a an and are as at be by do does for from how i in is it of on or our the this to we what when where which who why with you your".split(" "),
);

/** FNV-1a, 32 bit. @param {string} s */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Trigram features count this much of a word feature. */
const TRIGRAM_WEIGHT = Number(process.env.FAKE_TRIGRAM_WEIGHT ?? "0.05");

/**
 * Word and character-trigram features of a text: key -> occurrences and base weight.
 * @param {string} text
 */
function features(text) {
  const words = (
    text
      .replace(/^search_(query|document):\s*/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  )
    .filter((w) => !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  /** @type {Map<string, { n: number; w: number }>} */
  const f = new Map();
  /** @param {string} k @param {number} w */
  const add = (k, w) => {
    const cur = f.get(k);
    if (cur) cur.n++;
    else f.set(k, { n: 1, w });
  };
  for (const w of words) {
    add(`w:${w}`, 1);
    // Character trigrams, lightly weighted: related word forms (fibrillation / fibrillating) still overlap.
    if (TRIGRAM_WEIGHT > 0) {
      const padded = `^${w}$`;
      for (let i = 0; i + 3 <= padded.length; i++) add(`t:${padded.slice(i, i + 3)}`, TRIGRAM_WEIGHT);
    }
  }
  return f;
}

/** Deterministic unit vector of width DIM. @param {string} text */
function embedText(text) {
  const v = new Float64Array(DIM);
  for (const [key, { n, w }] of features(text)) {
    const weight = w * (1 + Math.log(n));
    for (let k = 0; k < 2; k++) {
      const h = fnv1a(`${k}|${key}`);
      v[h % DIM] += (h & 0x80000000 ? -1 : 1) * weight;
    }
  }
  let norm2 = 0;
  for (const x of v) norm2 += x * x;
  if (norm2 === 0) {
    v[0] = 1; // empty text: a fixed unit vector, never NaN
    norm2 = 1;
  }
  const n = Math.sqrt(norm2);
  return Array.from(v, (x) => Number((x / n).toFixed(6)));
}

/* ------------------------------------------------------------------------- */
/* Templated chat answer                                                      */
/* ------------------------------------------------------------------------- */

/** Sections of the user message that end a passage (see src/lib/assistant/prompt.ts). */
const SECTION = /^(question:|crew data \[c\]|library status:|ground link status:|the crew's question|<question>)/i;

/**
 * The question of the user message: the text between <question> tags
 * (prompt.ts puts it last), else a "Question:" line.
 * @param {string} message
 */
function questionOf(message) {
  const tagged = message.match(/<question>\s*([\s\S]*?)\s*<\/question>/i);
  if (tagged) return tagged[1];
  return message.match(/^question:\s*(.*)$/im)?.[1] ?? "";
}

/**
 * Sentences of the earliest passage in the message (each list item or line
 * is its own sentence, Markdown marks removed), or null without a passage.
 * @param {string} message
 * @returns {string[] | null}
 */
function firstPassage(message) {
  const lines = message.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^\[\d+\]\s/.test(l.trim()));
  if (start === -1) return null;
  /** @type {string[]} */
  const sentences = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (/^\[\d+\]\s/.test(line) || SECTION.test(line)) break;
    if (/^\(?source:/i.test(line) || /^\(.*\)$/.test(line)) continue;
    const text = line
      .replace(/^#+\s*/, "")
      .replace(/^([-*•]|\d+[.)])\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/[[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) sentences.push(...text.split(/(?<=[.!?])\s+/).filter(Boolean));
  }
  return sentences.length ? sentences : null;
}

/** @param {string} text */
function contentWords(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  );
}

/**
 * The sentence of the passage that shares the most words with the question
 * (the earliest on a tie), trimmed for the template.
 * @param {string[]} sentences
 * @param {string} question
 */
function bestSentence(sentences, question) {
  const q = contentWords(question);
  let best = 0;
  let bestScore = -1;
  sentences.forEach((sentence, i) => {
    const words = contentWords(sentence);
    let score = 0;
    for (const w of q) if (words.has(w)) score++;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  let s = sentences[best];
  if (s.length < 40 && sentences[best + 1]) s = `${s} ${sentences[best + 1]}`;
  if (s.length > 240) s = `${s.slice(0, 240).replace(/\s+\S*$/, "")}…`;
  s = s.replace(/[.!?:;,]+$/, "");
  // "Pulse oximeter: …" / "A blackout …" continue the template in lower case; "SpO₂", "NOAA" stay as they are.
  return /^[A-Z](?:[a-z]|\s)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/** @param {unknown} messages */
function answerFor(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const user = [...list].reverse().find((m) => m && m.role === "user" && typeof m.content === "string");
  const sentences = user ? firstPassage(user.content) : null;
  if (!sentences) return "NO_ANSWER";
  const question = questionOf(user.content);
  const answer = `According to the library, ${bestSentence(sentences, question)} [1].`;
  return THINK ? `<think>The question matches passage [1]; answer from it.</think>\n${answer}` : answer;
}

/* ------------------------------------------------------------------------- */
/* HTTP                                                                       */
/* ------------------------------------------------------------------------- */

/** @param {import("node:http").ServerResponse} res @param {number} status @param {unknown} body */
function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

/** @param {import("node:http").ServerResponse} res @param {number} status @param {string} message */
function fail(res, status, message) {
  send(res, status, { error: { message, type: "api_error" } });
}

/** @param {import("node:http").IncomingMessage} req @returns {Promise<any>} */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0].replace(/^\/v1(?=\/)/, "");
  if (DELAY_MS) await new Promise((r) => setTimeout(r, DELAY_MS));
  if (res.destroyed) return;
  if (FAIL.has("all")) return fail(res, 500, "simulated failure (FAKE_FAIL=all)");
  try {
    if (req.method === "GET" && path === "/models") {
      const created = 1_763_078_400;
      return send(res, 200, { object: "list", data: MODELS.map((id) => ({ id, object: "model", created, owned_by: "fake" })) });
    }
    if (req.method === "POST" && path === "/embeddings") {
      if (FAIL.has("embed")) return fail(res, 500, "simulated failure (FAKE_FAIL=embed)");
      const body = await readJson(req);
      if (!known(body.model)) return fail(res, 404, `model "${body.model}" not found, try pulling it first`);
      const input = typeof body.input === "string" ? [body.input] : body.input;
      if (!Array.isArray(input) || !input.every((t) => typeof t === "string")) return fail(res, 400, "input must be a string or an array of strings");
      const data = input.map((t, index) => ({ object: "embedding", index, embedding: embedText(t) })).reverse();
      return send(res, 200, { object: "list", data, model: body.model, usage: { prompt_tokens: 0, total_tokens: 0 } });
    }
    if (req.method === "POST" && path === "/chat/completions") {
      if (FAIL.has("chat")) return fail(res, 500, "simulated failure (FAKE_FAIL=chat)");
      const body = await readJson(req);
      if (!known(body.model)) return fail(res, 404, `model "${body.model}" not found, try pulling it first`);
      return send(res, 200, {
        id: `chatcmpl-fake-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: answerFor(body.messages) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
    return fail(res, 404, `no route ${req.method} ${req.url}`);
  } catch (err) {
    return fail(res, 400, err instanceof Error ? err.message : String(err));
  }
});

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(`fake model server listening on http://${HOST}:${port}/v1`);
  console.log(
    `  FAKE dev/test tool, not a model. models: ${MODELS.join(", ")}; embed width ${DIM}` +
      `${DELAY_MS ? `; delay ${DELAY_MS} ms` : ""}${FAIL.size ? `; failing: ${[...FAIL].join(", ")}` : ""}`,
  );
});

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
