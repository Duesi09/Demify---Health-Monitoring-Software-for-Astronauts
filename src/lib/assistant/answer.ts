import "server-only";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import type { LibraryHit, RetrievalTier } from "@onboard/library.mjs";
import { chat, modelStatus } from "@onboard/model.mjs";
import { isGroundLinkUp } from "../onboard/ground-link";
import type { AssistantAnswer, Citation, Freshness } from "../onboard/types";
import { crewContextFor, type CrewContext } from "./crew-context";
import { EXCERPT_MAX, excerpt } from "./excerpt";
import {
  libraryFreshness,
  libraryKnownWords,
  maybeAutoSync,
  resolveLibrary,
  searchOnboardLibrary,
  type ResolvedLibrary,
} from "./library-source";
import { buildMessages, type PromptPassage } from "./prompt";
import { germanBackedRemoved } from "./german";
import { searchQuestion, usableHits } from "./relevance";
import { blockedReason, checkAnswer, groundingCandidates, isEmergency, medicineLikeWords } from "./safety";
import {
  ACT_NOW_LINE,
  ASSISTANT_BUSY,
  ASSISTANT_NOTICE,
  NO_ANSWER_LINK_DOWN,
  NO_ANSWER_LINK_UP,
  PASSAGES_ONLY_REASON,
} from "./wording";

export { EXCERPT_MAX, excerpt };

/**
 * The onboard assistant (POST /api/assistant): answers a crew question from
 * the local library and nothing else, and says so when the library has no
 * good answer. It advises and never decides; it never raises or clears an
 * alarm (the rule engine stays primary).
 *
 *   blocked check -> model readiness (cached) -> retrieval (database or
 *   bundled, see library-source.ts; no vector search while the model server
 *   is known to be unreachable) -> relevance gate -> model (at most
 *   MAX_CONCURRENT_CHATS at a time) -> answer checks (citations, doses,
 *   grounding) -> citations
 *
 * Without a working model the matching passages are shown instead
 * ("passages-only"); the answer is never guessed. Without a database the
 * model writes the answer from the bundled keyword hits (no embeddings
 * needed).
 */

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;
/** Token budget of one answer; reasoning models spend part of it thinking. */
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.1;
/** Model readiness (GET /models) is reused this long; an unreachable model server is remembered longer. */
const MODEL_STATUS_TTL_MS = 10_000;
const MODEL_DOWN_TTL_MS = 30_000;
const MODEL_STATUS_TIMEOUT_MS = 2500;
/** Chat calls to the model server at the same time; further questions get 503 (ASSISTANT_BUSY). */
export const MAX_CONCURRENT_CHATS = 2;

/** Thrown when MAX_CONCURRENT_CHATS chat calls are already running (POST /api/assistant answers 503). */
export class AssistantBusyError extends Error {
  constructor() {
    super(ASSISTANT_BUSY);
    this.name = "AssistantBusyError";
  }
}

export interface AskInput {
  question: string;
  crewId?: string;
}

/** reachable: the model server answered (vector search may use it even when the language model is missing). */
export type ModelReady = { ready: true; reachable: true } | { ready: false; reachable: boolean; reason: string; detail: string };

const holder = globalThis as typeof globalThis & {
  __demifyModelReady?: { key: string; at: number; ttl: number; value: Promise<ModelReady> };
  __demifyChatsInFlight?: number;
};

/** Test helper: forget the cached model readiness and the running chat calls. */
export function resetAssistantState(): void {
  delete holder.__demifyModelReady;
  delete holder.__demifyChatsInFlight;
}

async function checkModel(cfg: OnboardConfig): Promise<ModelReady> {
  if (!cfg.modelUrl) {
    return { ready: false, reachable: false, reason: PASSAGES_ONLY_REASON.notConfigured, detail: "no language model configured" };
  }
  const s = await modelStatus(cfg, MODEL_STATUS_TIMEOUT_MS);
  if (!s.reachable) {
    return {
      ready: false,
      reachable: false,
      reason: PASSAGES_ONLY_REASON.unreachable,
      detail: `language model unreachable${s.error ? ` (${s.error})` : ""}`,
    };
  }
  if (!s.llmReady) {
    return {
      ready: false,
      reachable: true,
      reason: PASSAGES_ONLY_REASON.missing(cfg.llmModel),
      detail: `model ${cfg.llmModel} not listed by the model server`,
    };
  }
  return { ready: true, reachable: true };
}

const readinessKey = (cfg: OnboardConfig) => `${cfg.modelUrl ?? ""}|${cfg.llmModel}`;

/** Readiness of the language model, cached (MODEL_STATUS_TTL_MS; MODEL_DOWN_TTL_MS while unreachable). */
export function modelReady(cfg: OnboardConfig): Promise<ModelReady> {
  const key = readinessKey(cfg);
  const now = Date.now();
  const cached = holder.__demifyModelReady;
  if (cached && cached.key === key && now - cached.at < cached.ttl && now >= cached.at) return cached.value;
  const value = checkModel(cfg);
  const entry = { key, at: now, ttl: MODEL_STATUS_TTL_MS, value };
  holder.__demifyModelReady = entry;
  void value.then((r) => {
    if (!r.ready && !r.reachable) entry.ttl = MODEL_DOWN_TTL_MS;
  });
  return value;
}

/**
 * After a failed chat call: an unreachable model server is remembered as
 * unreachable for MODEL_DOWN_TTL_MS (the next questions skip vector search
 * and the model at once); any other failure makes the next question check
 * again.
 */
function noteChatFailure(cfg: OnboardConfig, err: unknown, reason: { reason: string; detail: string }): void {
  if ((err as { kind?: unknown } | null)?.kind === "unreachable" && cfg.modelUrl) {
    const value: Promise<ModelReady> = Promise.resolve({ ready: false, reachable: false, ...reason });
    holder.__demifyModelReady = { key: readinessKey(cfg), at: Date.now(), ttl: MODEL_DOWN_TTL_MS, value };
    return;
  }
  delete holder.__demifyModelReady;
}

/** Takes one of the MAX_CONCURRENT_CHATS chat slots, or throws AssistantBusyError. Returns the release function. */
function takeChatSlot(): () => void {
  const running = holder.__demifyChatsInFlight ?? 0;
  if (running >= MAX_CONCURRENT_CHATS) throw new AssistantBusyError();
  holder.__demifyChatsInFlight = running + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holder.__demifyChatsInFlight = Math.max(0, (holder.__demifyChatsInFlight ?? 1) - 1);
  };
}

function modelErrorReason(err: unknown): { reason: string; detail: string } {
  const kind = (err as { kind?: unknown } | null)?.kind;
  const message = err instanceof Error ? err.message : String(err);
  switch (kind) {
    case "not-configured":
      return { reason: PASSAGES_ONLY_REASON.notConfigured, detail: "no language model configured" };
    case "unreachable":
      return { reason: PASSAGES_ONLY_REASON.unreachable, detail: `language model unreachable (${message})` };
    case "timeout":
      return { reason: PASSAGES_ONLY_REASON.timeout, detail: `language model timed out (${message})` };
    case "http":
      if ((err as { status?: number }).status === 404) return { reason: PASSAGES_ONLY_REASON.failed, detail: `language model not found (${message})` };
      return { reason: PASSAGES_ONLY_REASON.failed, detail: `language model error (${message})` };
    default:
      return { reason: PASSAGES_ONLY_REASON.failed, detail: `language model error (${message})` };
  }
}

/** A retrieved passage as the crew sees it: excerpt around the question's words, plus the whole verified chunk. */
export function toCitation(hit: LibraryHit, n: number, question = ""): Citation {
  return {
    n,
    docId: hit.docId,
    title: hit.title,
    heading: hit.heading,
    category: hit.category,
    source: hit.source,
    ...(hit.url ? { url: hit.url } : {}),
    license: hit.license,
    ...(hit.reviewed ? { reviewed: hit.reviewed } : {}),
    version: hit.version,
    sha256: hit.sha256,
    excerpt: excerpt(hit.text, searchQuestion(question)),
    text: hit.text,
    score: hit.score,
    ...(hit.syncedAt ? { syncedAt: hit.syncedAt } : {}),
  };
}

/** The tier a search of this library would use (for answers that never searched). */
function expectedTier(lib: ResolvedLibrary, cfg: OnboardConfig): RetrievalTier {
  if (lib.source === "bundled") return "bundled";
  return cfg.modelUrl && cfg.vectorSearch ? "vector" : "fulltext";
}

const joinReasons = (...reasons: (string | undefined | null)[]) => {
  const list = [...new Set(reasons.filter((r): r is string => !!r))];
  return list.length ? list.join("; ") : undefined;
};

export interface ModelAnswerInput {
  /** The question as the model sees it (inside the <question> block). */
  question: string;
  /** The passages, already through the relevance gate; passage [n] is hits[n - 1]. */
  hits: LibraryHit[];
  crew: CrewContext | null;
  libraryAgeText: string;
  stale: boolean;
  groundLinkUp: boolean;
  /** Where the hits came from (the grounding check asks that library). */
  source: "database" | "bundled";
  lib: ResolvedLibrary;
  cfg: OnboardConfig;
}

export type ModelAnswer =
  | { ok: true; text: string; cited: number[] }
  | { ok: false; kind: "no-answer" }
  | { ok: false; kind: "passages-only"; reason: string; detail?: string };

/**
 * One model answer from these passages, checked before anyone sees it:
 * citations, doses, medicine-like words and grounding (words copied from
 * the question that no cited passage and no library text contains). Takes
 * one of the MAX_CONCURRENT_CHATS chat slots (throws AssistantBusyError
 * when none is free). Call it only when the model is ready. Shared by the
 * question form (askAssistant) and the alarm walk-through (alarm-guidance.ts).
 */
export async function modelAnswer(input: ModelAnswerInput): Promise<ModelAnswer> {
  const { question, hits, crew, cfg } = input;
  const passages: PromptPassage[] = hits.map((h, i) => ({
    n: i + 1,
    title: h.title,
    heading: h.heading,
    source: h.source,
    ...(h.reviewed ? { reviewed: h.reviewed } : {}),
    text: h.text,
  }));
  const release = takeChatSlot();
  let raw: string;
  try {
    raw = await chat(
      cfg,
      buildMessages({
        question,
        passages,
        crew: crew ? { source: crew.source, takenAt: crew.takenAt, summary: crew.summary } : null,
        libraryAgeText: input.libraryAgeText,
        stale: input.stale,
        groundLinkUp: input.groundLinkUp,
      }),
      { temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
    );
  } catch (err) {
    const why = modelErrorReason(err);
    noteChatFailure(cfg, err, why);
    return { ok: false, kind: "passages-only", ...why };
  } finally {
    release();
  }

  // Check the answer before anyone sees it.
  const check = checkAnswer(raw, passages.length, { crew: !!crew });
  if (!check.ok) {
    if (check.kind === "no-answer") return { ok: false, kind: "no-answer" };
    return { ok: false, kind: "passages-only", reason: check.reason, detail: check.detail };
  }
  const backing = [...check.cited.map((n) => `${hits[n - 1].title}\n${hits[n - 1].heading}\n${hits[n - 1].text}`), crew?.summary ?? ""];
  const medicineLike = medicineLikeWords(check.text, backing);
  // A German answer may repeat the question's German words when their glossary English is backed (german.ts).
  const candidates = germanBackedRemoved(groundingCandidates(check.text, question, backing), backing);
  const known = await libraryKnownWords([...new Set([...medicineLike, ...candidates])], input.source, input.lib, cfg);
  const unbacked = [...medicineLike, ...candidates.filter((w) => !known.has(w))];
  if (unbacked.length) {
    const n = new Set(unbacked).size;
    return {
      ok: false,
      kind: "passages-only",
      reason: PASSAGES_ONLY_REASON.ungrounded,
      detail: `model answer used ${n} word${n === 1 ? "" : "s"} that no cited passage contains`,
    };
  }
  return check;
}

/** Answers one crew question. Never throws for library or model failures; throws AssistantBusyError when the model is busy. */
export async function askAssistant(input: AskInput, cfg: OnboardConfig = onboardConfig()): Promise<AssistantAnswer> {
  const askedAt = new Date().toISOString();
  const question = input.question.trim().slice(0, QUESTION_MAX);
  const emergency = isEmergency(question);
  const withActNow = (text: string, sep: string) => (emergency ? `${ACT_NOW_LINE}${sep}${text}` : text);
  const blocked = blockedReason(question);

  const [groundLinkUp, lib, crew, ready] = await Promise.all([
    isGroundLinkUp(),
    resolveLibrary(cfg),
    input.crewId ? crewContextFor(input.crewId).catch((): CrewContext | null => null) : Promise.resolve(null),
    blocked ? Promise.resolve(null) : modelReady(cfg),
  ]);

  const result = (
    over: Pick<AssistantAnswer, "status" | "answer" | "citations"> & { reason?: string },
    ctx: { freshness: Pick<Freshness, "librarySyncedAt" | "libraryAgeText" | "stale">; retrieval: RetrievalTier; integrityFailures: number },
    model: string | null,
    fallbackReason: string | undefined,
  ): AssistantAnswer => ({
    ...over,
    ...(crew ? { crewContext: crew } : {}),
    freshness: { ...ctx.freshness, crewDataAt: crew?.takenAt ?? null, groundLinkUp },
    mode: {
      retrieval: ctx.retrieval,
      model,
      groundLink: groundLinkUp ? "up" : "down",
      ...(fallbackReason ? { fallbackReason } : {}),
    },
    integrityFailures: ctx.integrityFailures,
    askedAt,
    notice: ASSISTANT_NOTICE,
  });

  // 1. Questions the prototype never answers.
  if (blocked || !ready) {
    const freshness = await libraryFreshness(lib.source, lib, cfg);
    return result(
      { status: "blocked", answer: null, reason: withActNow(blocked ?? "", " "), citations: [] },
      { freshness, retrieval: expectedTier(lib, cfg), integrityFailures: 0 },
      null,
      lib.fallbackReason,
    );
  }

  // 2. Retrieval. While the model server is known to be unreachable, vector search is skipped (no embedding wait).
  const search = await searchOnboardLibrary(question, lib, cfg, { skipVector: !ready.ready && !ready.reachable });
  const freshness = await libraryFreshness(search.source, lib, cfg);
  if (groundLinkUp && lib.pool) {
    // A stale (or still empty) database library syncs in the background; this answer does not wait for it.
    const dbFreshness = search.source === "database" ? freshness : await libraryFreshness("database", lib, cfg);
    maybeAutoSync(lib, { groundLinkUp, stale: dbFreshness.stale }, cfg);
  }
  const hits = usableHits(search, question, { minScore: cfg.minScore, k: cfg.topK });
  const retrieval = { freshness, retrieval: search.tier, integrityFailures: search.integrityFailures };
  const noAnswer = withActNow(groundLinkUp ? NO_ANSWER_LINK_UP : NO_ANSWER_LINK_DOWN, " ");
  if (!hits.length) {
    return result({ status: "no-answer", answer: null, reason: noAnswer, citations: [] }, retrieval, null, search.fallbackReason);
  }
  const citations = hits.map((h, i) => toCitation(h, i + 1, question));
  const passagesOnly = (reason: string, detail?: string) =>
    result(
      { status: "passages-only", answer: null, reason: withActNow(reason, " "), citations },
      retrieval,
      null,
      joinReasons(search.fallbackReason, detail),
    );

  // 3. The model, when it is ready (at most MAX_CONCURRENT_CHATS at a time).
  if (!ready.ready) return passagesOnly(ready.reason, ready.detail);

  const outcome = await modelAnswer({
    question,
    hits,
    crew,
    libraryAgeText: freshness.libraryAgeText,
    stale: freshness.stale,
    groundLinkUp,
    source: search.source,
    lib,
    cfg,
  });
  if (!outcome.ok) {
    if (outcome.kind === "no-answer") {
      return result({ status: "no-answer", answer: null, reason: noAnswer, citations: [] }, retrieval, cfg.llmModel, search.fallbackReason);
    }
    return passagesOnly(outcome.reason, outcome.detail);
  }
  const check = outcome;
  const cited = new Set(check.cited);
  return result(
    { status: "answered", answer: withActNow(check.text, "\n\n"), citations: citations.filter((c) => cited.has(c.n)) },
    retrieval,
    cfg.llmModel,
    search.fallbackReason,
  );
}
