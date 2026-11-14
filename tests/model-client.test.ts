import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import { chat, embed, ModelError, modelStatus } from "@onboard/model.mjs";

/**
 * The model client (onboard/model.mjs) against the fake OpenAI-compatible
 * server (scripts/dev/fake-model-server.mjs, a dev/test tool, not a model)
 * and against small stub servers for the edge cases: model list, embedding
 * width and order, task prefixes, reasoning stripping, and every failure
 * mapped to a ModelError kind.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const FAKE = path.join(ROOT, "scripts/dev/fake-model-server.mjs");

interface Fake {
  url: string;
  stop: () => Promise<void>;
}

/** Starts the fake model server on a free port. */
async function startFake(env: Record<string, string> = {}): Promise<Fake> {
  const child: ChildProcess = spawn(process.execPath, [FAKE, "--port", "0"], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`fake model server did not start: ${out}`)), 10_000);
    child.stdout!.on("data", (d: Buffer) => {
      out += d.toString();
      const m = out.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/v1)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.stderr!.on("data", (d: Buffer) => (out += d.toString()));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`fake model server exited (${code}): ${out}`));
    });
  });
  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

/** A tiny HTTP server whose answers each test sets. */
async function startStub(): Promise<{ url: string; setHandler: (h: Handler) => void; close: () => Promise<void> }> {
  let handler: Handler = (_req, _body, res) => {
    res.writeHead(404).end();
  };
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => handler(req, body, res));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    setHandler: (h) => (handler = h),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

function cfgFor(url: string | undefined, over: Partial<OnboardConfig> = {}): OnboardConfig {
  return { ...onboardConfig({ ...(url ? { DEMIFY_MODEL_URL: url } : {}) }), ...over };
}

async function modelError(p: Promise<unknown>): Promise<ModelError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ModelError);
    return err as ModelError;
  }
  throw new Error("expected a ModelError");
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const PASSAGES =
  "Question: The monitor shows ventricular fibrillation. What does the drill checklist say?\n\nLibrary passages:\n\n" +
  "[1] Alarm response drill checklists › Cardiac arrest (ventricular fibrillation)\n(source: Demify project text; Project text, not clinically reviewed)\n" +
  "1. Call the crew to the patient and start the emergency checklist. Check for a response.\n2. Start CPR.\n\n" +
  "[2] Escalation › Signal delay\n(source: Demify project text)\nThe flight surgeon is called over the ground link.\n\n" +
  "Library status: last synced 2 hours ago.\nGround link status: up. The flight surgeons can be reached.";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("model client against the fake model server", () => {
  let fake: Fake;
  beforeAll(async () => {
    fake = await startFake();
  });
  afterAll(async () => {
    await fake.stop();
  });

  it("lists the models and reports both ready", async () => {
    const s = await modelStatus(cfgFor(fake.url));
    expect(s).toEqual({ reachable: true, available: ["gpt-oss:20b", "nomic-embed-text"], llmReady: true, embedReady: true });
    const other = await modelStatus(cfgFor(fake.url, { llmModel: "gpt-oss:120b" }));
    expect(other).toMatchObject({ reachable: true, llmReady: false, embedReady: true });
  });

  it("embeds to 768-d unit vectors in input order (the fake answers in reverse order)", async () => {
    const cfg = cfgFor(fake.url);
    const texts = ["ventricular fibrillation drill checklist", "cardiac arrest with ventricular fibrillation", "pulse oximeter in the medical kit"];
    const vectors = await embed(cfg, texts, "document");
    expect(vectors).toHaveLength(3);
    for (const v of vectors) {
      expect(v).toHaveLength(768);
      expect(Math.abs(Math.hypot(...v) - 1)).toBeLessThan(1e-3);
    }
    // Each vector belongs to its own text, whatever order the server answered in.
    for (let i = 0; i < texts.length; i++) expect((await embed(cfg, [texts[i]], "document"))[0]).toEqual(vectors[i]);
    // Similar texts get similar vectors.
    expect(dot(vectors[0], vectors[1])).toBeGreaterThan(dot(vectors[0], vectors[2]) + 0.2);
    expect(await embed(cfg, [], "query")).toEqual([]);
  });

  it("answers from passage [1] and strips the <think> block", async () => {
    const answer = await chat(cfgFor(fake.url), [
      { role: "system", content: "Answer from the passages." },
      { role: "user", content: PASSAGES },
    ]);
    expect(answer).toBe("According to the library, call the crew to the patient and start the emergency checklist [1].");
    expect(answer).not.toMatch(/think/i);
  });

  it("answers exactly NO_ANSWER when the message has no passages", async () => {
    expect(await chat(cfgFor(fake.url), [{ role: "user", content: "Question: what is the weather?" }])).toBe("NO_ANSWER");
  });

  it("maps an unknown model to an HTTP 404 ModelError", async () => {
    const cfg = cfgFor(fake.url, { llmModel: "no-such-model", embedModel: "no-such-embedder" });
    const c = await modelError(chat(cfg, [{ role: "user", content: "hi" }]));
    expect(c).toMatchObject({ kind: "http", status: 404 });
    expect(c.message).toMatch(/not found/);
    expect(await modelError(embed(cfg, ["x"], "query"))).toMatchObject({ kind: "http", status: 404 });
  });
});

describe("model ids with and without :latest", () => {
  it("treats nomic-embed-text and nomic-embed-text:latest as the same model", async () => {
    const fake = await startFake({ FAKE_MODELS: "gpt-oss:20b:latest,nomic-embed-text:latest" });
    try {
      expect(await modelStatus(cfgFor(fake.url))).toMatchObject({ llmReady: true, embedReady: true });
      expect(await embed(cfgFor(fake.url), ["a"], "query")).toHaveLength(1);
    } finally {
      await fake.stop();
    }
    const plain = await startFake({ FAKE_MODELS: "gpt-oss:20b,nomic-embed-text" });
    try {
      expect(await modelStatus(cfgFor(plain.url, { embedModel: "nomic-embed-text:latest" }))).toMatchObject({ embedReady: true });
    } finally {
      await plain.stop();
    }
  });
});

describe("failures become ModelError kinds", () => {
  it("not-configured without DEMIFY_MODEL_URL", async () => {
    const cfg = cfgFor(undefined);
    expect(cfg.modelUrl).toBeUndefined();
    expect(await modelStatus(cfg)).toMatchObject({ reachable: false, available: [], llmReady: false, embedReady: false });
    expect(await modelError(embed(cfg, ["x"], "query"))).toMatchObject({ kind: "not-configured" });
    expect(await modelError(chat(cfg, [{ role: "user", content: "x" }]))).toMatchObject({ kind: "not-configured" });
  });

  it("unreachable when nothing listens", async () => {
    const cfg = cfgFor(`http://127.0.0.1:${await closedPort()}/v1`);
    const s = await modelStatus(cfg);
    expect(s.reachable).toBe(false);
    expect(s.error).toMatch(/unreachable/);
    expect(await modelError(chat(cfg, [{ role: "user", content: "x" }]))).toMatchObject({ kind: "unreachable" });
    expect(await modelError(embed(cfg, ["x"], "query"))).toMatchObject({ kind: "unreachable" });
  });

  it("timeout when the server is too slow, and when the caller cancels", async () => {
    const fake = await startFake({ FAKE_DELAY_MS: "2000" });
    try {
      const cfg = cfgFor(fake.url, { llmTimeoutMs: 300, embedTimeoutMs: 300 });
      const started = Date.now();
      const s = await modelStatus(cfg, 300);
      expect(s.reachable).toBe(false);
      expect(s.error).toMatch(/no answer within 0.3 s/);
      const c = await modelError(chat(cfg, [{ role: "user", content: "x" }]));
      expect(c.kind).toBe("timeout");
      expect(await modelError(embed(cfg, ["x"], "query"))).toMatchObject({ kind: "timeout" });
      expect(Date.now() - started).toBeLessThan(1800);

      const ctrl = new AbortController();
      const slow = chat(cfgFor(fake.url), [{ role: "user", content: "x" }], { signal: ctrl.signal });
      ctrl.abort();
      const cancelled = await modelError(slow);
      expect(cancelled.kind).toBe("timeout");
      expect(cancelled.message).toMatch(/cancelled/);
    } finally {
      await fake.stop();
    }
  });

  it("http when an endpoint fails (FAKE_FAIL)", async () => {
    const fake = await startFake({ FAKE_FAIL: "chat" });
    try {
      const cfg = cfgFor(fake.url);
      const c = await modelError(chat(cfg, [{ role: "user", content: "x" }]));
      expect(c).toMatchObject({ kind: "http", status: 500 });
      expect(c.message).toMatch(/simulated failure/);
      expect(await embed(cfg, ["still works"], "query")).toHaveLength(1);
    } finally {
      await fake.stop();
    }
    const all = await startFake({ FAKE_FAIL: "all" });
    try {
      const cfg = cfgFor(all.url);
      expect(await modelStatus(cfg)).toMatchObject({ reachable: false });
      expect(await modelError(embed(cfg, ["x"], "query"))).toMatchObject({ kind: "http", status: 500 });
    } finally {
      await all.stop();
    }
  });

  it("bad-response when the embedding width is wrong", async () => {
    const fake = await startFake({ FAKE_EMBED_DIM: "384" });
    try {
      const e = await modelError(embed(cfgFor(fake.url), ["x", "y"], "document"));
      expect(e.kind).toBe("bad-response");
      expect(e.message).toMatch(/768/);
    } finally {
      await fake.stop();
    }
  });
});

describe("request and response handling (stub server)", () => {
  let stub: Awaited<ReturnType<typeof startStub>>;
  beforeAll(async () => {
    stub = await startStub();
  });
  afterAll(async () => {
    await stub.close();
  });

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" }).end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const chatAnswer = (content: unknown, finish = "stop") => ({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }] });

  /** Records the embedding inputs the client sends. */
  function captureEmbeddings(): string[][] {
    const seen: string[][] = [];
    stub.setHandler((_req, body, res) => {
      const { input } = JSON.parse(body) as { input: string[] };
      seen.push(input);
      json(res, 200, { data: input.map((_, index) => ({ index, embedding: new Array(768).fill(0.01) })) });
    });
    return seen;
  }

  it("adds the nomic task prefixes, and only for nomic models unless DEMIFY_EMBED_PREFIXES says so", async () => {
    const seen = captureEmbeddings();
    await embed(cfgFor(stub.url), ["where is the oximeter"], "query");
    await embed(cfgFor(stub.url), ["Pulse oximeter: Medical kit A"], "document");
    await embed(cfgFor(stub.url, { embedModel: "all-minilm" }), ["plain"], "query");
    vi.stubEnv("DEMIFY_EMBED_PREFIXES", "true");
    await embed(cfgFor(stub.url, { embedModel: "all-minilm" }), ["forced"], "document");
    vi.stubEnv("DEMIFY_EMBED_PREFIXES", "false");
    await embed(cfgFor(stub.url), ["off"], "query");
    expect(seen).toEqual([
      ["search_query: where is the oximeter"],
      ["search_document: Pulse oximeter: Medical kit A"],
      ["plain"],
      ["search_document: forced"],
      ["off"],
    ]);
  });

  it("sends a non-streaming OpenAI chat request", async () => {
    let request: Record<string, unknown> = {};
    let route = "";
    stub.setHandler((req, body, res) => {
      route = `${req.method} ${req.url}`;
      request = JSON.parse(body);
      json(res, 200, chatAnswer("Fine [1]."));
    });
    const messages = [{ role: "user" as const, content: "q" }];
    expect(await chat(cfgFor(stub.url), messages, { temperature: 0, maxTokens: 77 })).toBe("Fine [1].");
    expect(route).toBe("POST /v1/chat/completions");
    expect(request).toEqual({ model: "gpt-oss:20b", messages, temperature: 0, max_tokens: 77, stream: false });
  });

  it.each([
    ["<think>The user asks about VF.</think>\nStart the checklist [1].", "Start the checklist [1]."],
    ["<thinking>a</thinking><think>b</think>Answer [2].", "Answer [2]."],
    ["reasoning text</think>\n\nAnswer [1].", "Answer [1]."],
    ["<|channel|>analysis<|message|>Need passage 1.<|end|><|start|>assistant<|channel|>final<|message|>Answer [1].", "Answer [1]."],
    ["analysisThe user asks about the kit. Passage 1 says kit A.assistantfinalThe oximeter is in kit A [1].", "The oximeter is in kit A [1]."],
    ["Analysis: check passage 1.\nFinal: Use the checklist [1].", "Use the checklist [1]."],
    ["NO_ANSWER", "NO_ANSWER"],
  ])("strips reasoning from %j", async (content, expected) => {
    stub.setHandler((_req, _body, res) => json(res, 200, chatAnswer(content)));
    expect(await chat(cfgFor(stub.url), [{ role: "user", content: "q" }])).toBe(expected);
  });

  it.each([
    ["<think>still thinking when the tokens ran out", "length"],
    ["<|channel|>analysis<|message|>only reasoning", "length"],
    ["analysisThe user asks something and the answer never came", "length"],
    ["   ", "stop"],
  ])("bad-response when nothing but reasoning comes back (%j)", async (content, finish) => {
    stub.setHandler((_req, _body, res) => json(res, 200, chatAnswer(content, finish)));
    const e = await modelError(chat(cfgFor(stub.url), [{ role: "user", content: "q" }]));
    expect(e.kind).toBe("bad-response");
    expect(e.message).toMatch(/empty answer/);
  });

  it("bad-response for malformed answers", async () => {
    const cfg = cfgFor(stub.url);
    stub.setHandler((_req, _body, res) => json(res, 200, "{not json"));
    expect(await modelError(chat(cfg, [{ role: "user", content: "q" }]))).toMatchObject({ kind: "bad-response" });
    stub.setHandler((_req, _body, res) => json(res, 200, { choices: [] }));
    expect(await modelError(chat(cfg, [{ role: "user", content: "q" }]))).toMatchObject({ kind: "bad-response" });
    stub.setHandler((_req, _body, res) => json(res, 200, { data: [{ index: 0, embedding: new Array(768).fill(0) }] }));
    const e = await modelError(embed(cfg, ["a", "b"], "query"));
    expect(e).toMatchObject({ kind: "bad-response" });
    expect(e.message).toMatch(/expected 2 vectors, got 1/);
    stub.setHandler((_req, _body, res) => json(res, 200, { data: [{ index: 0, embedding: [...new Array(767).fill(0), Number.NaN] }] }));
    expect(await modelError(embed(cfg, ["a"], "query"))).toMatchObject({ kind: "bad-response" });
    stub.setHandler((_req, _body, res) => json(res, 200, { object: "list" }));
    expect(await modelStatus(cfg)).toMatchObject({ reachable: true, llmReady: false, error: expect.stringMatching(/no data/) });
  });

  it("keeps the server's error message on HTTP errors", async () => {
    stub.setHandler((_req, _body, res) => json(res, 503, { error: { message: "model is loading" } }));
    const e = await modelError(chat(cfgFor(stub.url), [{ role: "user", content: "q" }]));
    expect(e).toMatchObject({ kind: "http", status: 503 });
    expect(e.message).toMatch(/HTTP 503: model is loading/);
  });
});
