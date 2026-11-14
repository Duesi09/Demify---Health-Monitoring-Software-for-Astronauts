import "server-only";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import type { LibraryHit, RetrievalTier } from "@onboard/library.mjs";
import { chat, modelStatus } from "@onboard/model.mjs";
import { isGroundLinkUp } from "../onboard/ground-link";
import type { AssistantAnswer, Citation, Freshness } from "../onboard/types";
import { crewContextFor, type CrewContext } from "./crew-context";
import { libraryFreshness, maybeAutoSync, resolveLibrary, searchOnboardLibrary, type ResolvedLibrary } from "./library-source";
import { buildMessages, type PromptPassage } from "./prompt";
import { usableHits } from "./relevance";
import { blockedReason, checkAnswer, isEmergency } from "./safety";
import {
  ACT_NOW_LINE,
  ASSISTANT_NOTICE,
  NO_ANSWER_LINK_DOWN,
  NO_ANSWER_LINK_UP,
  PASSAGES_ONLY_REASON,
} from "./wording";

/**
 * The onboard assistant (POST /api/assistant): answers a crew question from
 * the local library and nothing else, and says so when the library has no
 * good answer. It advises and never decides; it never raises or clears an
 * alarm (the rule engine stays primary).
 *
 *   blocked check -> retrieval (database or bundled, see library-source.ts)
 *   -> relevance gate -> model (when ready) -> answer check -> citations
 *
 * Without a working model the matching passages are shown instead
 * ("passages-only"); the answer is never guessed.
 */

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;
/** Citation excerpts are cut to this many characters (ellipsis included). */
export const EXCERPT_MAX = 300;
/** Token budget of one answer; reasoning models spend part of it thinking. */
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.1;
/** Model readiness (GET /models) is reused this long. */
const MODEL_STATUS_TTL_MS = 10_000;
const MODEL_STATUS_TIMEOUT_MS = 2500;

export interface AskInput {
  question: string;
  crewId?: string;
}

type ModelReady = { ready: true } | { ready: false; reason: string; detail: string };

const holder = globalThis as typeof globalThis & {
  __demifyModelReady?: { key: string; at: number; value: Promise<ModelReady> };
};

/** Test helper: forget the cached model readiness. */
export function resetAssistantState(): void {
  delete holder.__demifyModelReady;
}

async function checkModel(cfg: OnboardConfig): Promise<ModelReady> {
  if (!cfg.modelUrl) return { ready: false, reason: PASSAGES_ONLY_REASON.notConfigured, detail: "no language model configured" };
  const s = await modelStatus(cfg, MODEL_STATUS_TIMEOUT_MS);
  if (!s.reachable) {
    return { ready: false, reason: PASSAGES_ONLY_REASON.unreachable, detail: `language model unreachable${s.error ? ` (${s.error})` : ""}` };
  }
  if (!s.llmReady) {
    return { ready: false, reason: PASSAGES_ONLY_REASON.missing(cfg.llmModel), detail: `model ${cfg.llmModel} not listed by the model server` };
  }
  return { ready: true };
}

/** Readiness of the language model, cached for MODEL_STATUS_TTL_MS. */
function modelReady(cfg: OnboardConfig): Promise<ModelReady> {
  const key = `${cfg.modelUrl ?? ""}|${cfg.llmModel}`;
  const now = Date.now();
  const cached = holder.__demifyModelReady;
  if (cached && cached.key === key && now - cached.at < MODEL_STATUS_TTL_MS && now >= cached.at) return cached.value;
  const value = checkModel(cfg);
  holder.__demifyModelReady = { key, at: now, value };
  return value;
}

/** A failed chat call makes the next question check the model again. */
function forgetModelReady(): void {
  delete holder.__demifyModelReady;
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

/** Cuts text at a word boundary so the result (with "…") has at most max characters. */
export function excerpt(text: string, max = EXCERPT_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

export function toCitation(hit: LibraryHit, n: number): Citation {
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
    excerpt: excerpt(hit.text),
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

/** Answers one crew question. Never throws for library or model failures. */
export async function askAssistant(input: AskInput, cfg: OnboardConfig = onboardConfig()): Promise<AssistantAnswer> {
  const askedAt = new Date().toISOString();
  const question = input.question.trim().slice(0, QUESTION_MAX);
  const emergency = isEmergency(question);
  const withActNow = (text: string, sep: string) => (emergency ? `${ACT_NOW_LINE}${sep}${text}` : text);

  const [groundLinkUp, lib, crew] = await Promise.all([
    isGroundLinkUp(),
    resolveLibrary(cfg),
    input.crewId ? crewContextFor(input.crewId).catch((): CrewContext | null => null) : Promise.resolve(null),
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
  const blocked = blockedReason(question);
  if (blocked) {
    const freshness = await libraryFreshness(lib.source, lib, cfg);
    return result(
      { status: "blocked", answer: null, reason: withActNow(blocked, " "), citations: [] },
      { freshness, retrieval: expectedTier(lib, cfg), integrityFailures: 0 },
      null,
      lib.fallbackReason,
    );
  }

  // 2. Retrieval.
  const search = await searchOnboardLibrary(question, lib, cfg);
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
  const citations = hits.map((h, i) => toCitation(h, i + 1));
  const passagesOnly = (reason: string, detail?: string) =>
    result(
      { status: "passages-only", answer: null, reason: withActNow(reason, " "), citations },
      retrieval,
      null,
      joinReasons(search.fallbackReason, detail),
    );

  // 3. The model, when it is ready.
  const ready = await modelReady(cfg);
  if (!ready.ready) return passagesOnly(ready.reason, ready.detail);

  const passages: PromptPassage[] = hits.map((h, i) => ({
    n: i + 1,
    title: h.title,
    heading: h.heading,
    source: h.source,
    ...(h.reviewed ? { reviewed: h.reviewed } : {}),
    text: h.text,
  }));
  let raw: string;
  try {
    raw = await chat(
      cfg,
      buildMessages({
        question,
        passages,
        crew: crew ? { source: crew.source, takenAt: crew.takenAt, summary: crew.summary } : null,
        libraryAgeText: freshness.libraryAgeText,
        stale: freshness.stale,
        groundLinkUp,
      }),
      { temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
    );
  } catch (err) {
    forgetModelReady();
    const { reason, detail } = modelErrorReason(err);
    return passagesOnly(reason, detail);
  }

  // 4. Check the answer before anyone sees it.
  const check = checkAnswer(raw, passages.length);
  if (!check.ok) {
    if (check.kind === "no-answer") {
      return result({ status: "no-answer", answer: null, reason: noAnswer, citations: [] }, retrieval, cfg.llmModel, search.fallbackReason);
    }
    return passagesOnly(check.reason, check.kind === "dose" ? "model answer contained a dose pattern" : "model answer had no valid citation");
  }
  const cited = new Set(check.cited);
  return result(
    { status: "answered", answer: withActNow(check.text, "\n\n"), citations: citations.filter((c) => cited.has(c.n)) },
    retrieval,
    cfg.llmModel,
    search.fallbackReason,
  );
}
