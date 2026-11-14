import "server-only";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import type { LibraryHit, RetrievalTier } from "@onboard/library.mjs";
import { getAllLiveVitals } from "../monitor/live";
import { effectiveLink } from "../onboard/effective-link";
import {
  alarmEvents,
  eventQueries,
  walkthroughQuestion,
  type AlarmEvent,
  type AlarmGuidance,
  type AlarmGuidanceResponse,
  type AlarmWalkthrough,
  type EventScenario,
} from "./alarm-events";
import { AssistantBusyError, excerpt, modelAnswer, modelReady, toCitation } from "./answer";
import { libraryFreshness, resolveLibrary, searchOnboardLibrary, type ResolvedLibrary } from "./library-source";
import { usableHits } from "./relevance";
import { PASSAGES_ONLY_REASON } from "./wording";

/**
 * Server side of the assistant's response to an alarm Demify raised
 * (GET/POST /api/assistant/event). See alarm-events.ts for the idea.
 *
 * - Instant: the matching checklist passages, found with the event's fixed
 *   queries (keyword or full-text search, never an embedding or a chat
 *   call), cached per event for RETRIEVAL_TTL_MS.
 * - Walk-through: one model call per event and link mode, deduplicated
 *   (every caller of the same event waits for the same call) and kept for
 *   WALKTHROUGH_TTL_MS; at most MAX_WALKTHROUGHS run at once, inside the
 *   assistant's own limit of MAX_CONCURRENT_CHATS, so a crew question can
 *   still be answered while a walk-through runs. Same checks as every
 *   assistant answer (modelAnswer).
 */

/** Passages shown per alarm. */
export const EVENT_PASSAGES = 3;
/** Fixed query for the library's blackout procedure (ground-link blackout: handling a medical event, the flight-surgeon step). */
export const BLACKOUT_QUERY = "flight-surgeon step blackout no contact";
/** Excerpt length that keeps every library chunk whole. */
const WHOLE_PASSAGE = 4000;
const RETRIEVAL_TTL_MS = 60_000;
const WALKTHROUGH_TTL_MS = 30 * 60_000;
const CACHE_MAX = 64;
/** Walk-throughs running at the same time (the question form keeps the other chat slot). */
export const MAX_WALKTHROUGHS = 1;

interface Retrieved {
  at: number;
  query: string | null;
  hits: LibraryHit[];
  source: "database" | "bundled";
  retrieval: RetrievalTier;
  fallbackReason?: string;
  integrityFailures: number;
}

interface WalkEntry {
  at: number;
  promise: Promise<AlarmWalkthrough>;
  done?: AlarmWalkthrough;
}

const holder = globalThis as typeof globalThis & {
  __demifyEventRetrieval?: Map<string, Promise<Retrieved>>;
  __demifyEventRetrievalAt?: Map<string, number>;
  __demifyWalkthroughs?: Map<string, WalkEntry>;
  __demifyWalkthroughsRunning?: number;
};

/** Test helper: forget cached passages and walk-throughs. */
export function resetAlarmGuidance(): void {
  delete holder.__demifyEventRetrieval;
  delete holder.__demifyEventRetrievalAt;
  delete holder.__demifyWalkthroughs;
  delete holder.__demifyWalkthroughsRunning;
}

function retrievalCache() {
  holder.__demifyEventRetrieval ??= new Map();
  holder.__demifyEventRetrievalAt ??= new Map();
  return { values: holder.__demifyEventRetrieval, times: holder.__demifyEventRetrievalAt };
}

function walkCache(): Map<string, WalkEntry> {
  holder.__demifyWalkthroughs ??= new Map();
  return holder.__demifyWalkthroughs;
}

/** Drops the oldest entries beyond CACHE_MAX and everything older than maxAge. */
function prune<V>(map: Map<string, V>, at: (v: V, k: string) => number, maxAge: number, now = Date.now()): void {
  for (const [k, v] of map) if (now - at(v, k) > maxAge) map.delete(k);
  while (map.size > CACHE_MAX) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

/** Active events from the live alarms (the same data GET /api/alarms serves). */
export async function activeAlarmEvents(now = Date.now()): Promise<AlarmEvent[]> {
  const live = await getAllLiveVitals(now);
  const alarms = live.flatMap((v) => (Array.isArray(v.alarms) ? v.alarms : []));
  const scenarios: EventScenario[] = live.flatMap((v) =>
    v.scenario ? [{ crewId: v.crewId, type: v.scenario.type, startedAt: v.scenario.startedAt, label: v.scenario.label }] : [],
  );
  return alarmEvents(alarms, scenarios);
}

/**
 * The fixed queries in turn until one finds usable passages. Keyword /
 * full-text only: no model call. In a blackout the library's procedure for
 * a medical event during a blackout (BLACKOUT_QUERY: the flight-surgeon step
 * becomes "prepare the report … transmit when contact returns") is added,
 * so the crew sees it and the walk-through has it to cite.
 */
async function retrieve(e: AlarmEvent, lib: ResolvedLibrary, cfg: OnboardConfig, blackout: boolean): Promise<Retrieved> {
  let last: Omit<Retrieved, "at" | "query" | "hits"> | null = null;
  for (const query of eventQueries(e)) {
    const search = await searchOnboardLibrary(query, lib, cfg, { skipVector: true });
    last = { source: search.source, retrieval: search.tier, fallbackReason: search.fallbackReason, integrityFailures: search.integrityFailures };
    const hits = usableHits(search, query, { minScore: cfg.minScore, k: EVENT_PASSAGES });
    if (hits.length) {
      if (blackout) {
        const extra = await searchOnboardLibrary(BLACKOUT_QUERY, lib, cfg, { skipVector: true });
        const step = usableHits(extra, BLACKOUT_QUERY, { minScore: cfg.minScore, k: 3 }).find((h) => !hits.some((x) => x.sha256 === h.sha256));
        if (step) hits.push(step);
      }
      return { at: Date.now(), query, hits, ...last };
    }
  }
  return {
    at: Date.now(),
    query: null,
    hits: [],
    ...(last ?? { source: lib.source, retrieval: lib.source === "bundled" ? "bundled" : "fulltext", integrityFailures: 0 }),
  };
}

/** Passages for an event, cached per event, link mode and library source. Never throws (search falls back to the bundled library). */
function retrieved(e: AlarmEvent, lib: ResolvedLibrary, cfg: OnboardConfig, blackout: boolean): Promise<Retrieved> {
  const { values, times } = retrievalCache();
  const key = `${e.key}|${blackout ? "down" : "up"}|${lib.source}`;
  const now = Date.now();
  const at = times.get(key);
  const hit = values.get(key);
  if (hit && at != null && now - at < RETRIEVAL_TTL_MS) return hit;
  const p = retrieve(e, lib, cfg, blackout);
  values.set(key, p);
  times.set(key, now);
  p.catch(() => {
    values.delete(key);
    times.delete(key);
  });
  prune(times, (t) => t, RETRIEVAL_TTL_MS, now);
  for (const k of values.keys()) if (!times.has(k)) values.delete(k);
  return p;
}

/**
 * Without the model's uncited lead-in line ("Here's the response to the crew's question, based on the library
 * passages:"): the panel already says what the walk-through is. Only a first line that ends with a colon and cites
 * nothing is dropped, and only when cited text follows.
 */
export function dropLeadIn(text: string): string {
  const m = /^([^\n]*)\n+([\s\S]+)$/.exec(text.trim());
  if (!m) return text;
  const [, first, rest] = m;
  if (/\[(?:\d+|C)\]/.test(first) || !/:\s*$/.test(first) || !/\[\d+\]/.test(rest)) return text;
  return rest.trim();
}

const walkKey = (eventKey: string, blackout: boolean) => `${eventKey}|${blackout ? "down" : "up"}`;

/** True while no contact: ground-link switch down, or the conjunction profile. */
async function isBlackout(link: string | null | undefined): Promise<boolean> {
  try {
    return (await effectiveLink(link ?? undefined)).policy.mode === "blackout";
  } catch {
    return false;
  }
}

/** GET /api/assistant/event: every active alarm event with its checklist passages (instant), plus a finished walk-through when there is one. */
export async function alarmGuidance(link?: string | null, cfg: OnboardConfig = onboardConfig()): Promise<AlarmGuidanceResponse> {
  const [events, blackout, lib] = await Promise.all([activeAlarmEvents(), isBlackout(link), resolveLibrary(cfg)]);
  const ready = cfg.modelUrl ? await modelReady(cfg) : null;
  const walks = walkCache();
  const out: AlarmGuidance[] = await Promise.all(
    events.map(async (event) => {
      const r = await retrieved(event, lib, cfg, blackout);
      const freshness = await libraryFreshness(r.source, lib, cfg);
      const done = walks.get(walkKey(event.key, blackout))?.done ?? null;
      return {
        event,
        query: r.query,
        // The whole passage (a chunk is at most about 1200 characters): the crew sees every checklist step at once.
        citations: r.hits.map((h, i) => ({ ...toCitation(h, i + 1, r.query ?? ""), excerpt: excerpt(h.text, "", WHOLE_PASSAGE) })),
        freshness,
        retrieval: r.retrieval,
        ...(r.fallbackReason ? { fallbackReason: r.fallbackReason } : {}),
        integrityFailures: r.integrityFailures,
        walkthrough: done,
      };
    }),
  );
  return {
    events: out,
    blackout,
    model: ready?.ready
      ? { ready: true, name: cfg.llmModel }
      : { ready: false, name: cfg.modelUrl ? cfg.llmModel : null, reason: ready && !ready.ready ? ready.reason : PASSAGES_ONLY_REASON.notConfigured },
    at: new Date().toISOString(),
  };
}

export type WalkthroughResult =
  | { kind: "walkthrough"; walkthrough: AlarmWalkthrough; started: boolean }
  /** The alarm is no longer active (or the key is unknown). */
  | { kind: "ended" };

/** True when a call for this event would start a new model call (the route charges the rate limit only then). */
export function walkthroughCached(eventKey: string, blackout: boolean): boolean {
  return walkCache().has(walkKey(eventKey, blackout));
}

/**
 * POST /api/assistant/event: the walk-through for one active event. A
 * finished or running walk-through of the same event and link mode is
 * reused; a new model call starts only when there is none. "busy" (not
 * kept) while another walk-through or two crew questions hold the model.
 */
export async function alarmWalkthrough(
  eventKey: string,
  link?: string | null,
  cfg: OnboardConfig = onboardConfig(),
  opts: { mayStart?: (blackout: boolean) => boolean } = {},
): Promise<WalkthroughResult | { kind: "limited" }> {
  const [events, blackout] = await Promise.all([activeAlarmEvents(), isBlackout(link)]);
  const event = events.find((e) => e.key === eventKey);
  if (!event) return { kind: "ended" };
  const key = walkKey(event.key, blackout);
  const walks = walkCache();
  prune(walks, (w) => w.at, WALKTHROUGH_TTL_MS);
  const existing = walks.get(key);
  if (existing) return { kind: "walkthrough", walkthrough: await existing.promise, started: false };
  if (opts.mayStart && !opts.mayStart(blackout)) return { kind: "limited" };

  const startedAt = new Date();
  const finish = (over: Pick<AlarmWalkthrough, "status" | "answer" | "model"> & { reason?: string }): AlarmWalkthrough => {
    const finishedAt = new Date();
    return {
      key,
      ...over,
      groundLink: blackout ? "down" : "up",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    };
  };

  const running = holder.__demifyWalkthroughsRunning ?? 0;
  if (running >= MAX_WALKTHROUGHS) {
    return { kind: "walkthrough", walkthrough: finish({ status: "busy", answer: null, model: null }), started: false };
  }

  const entry = { at: Date.now() } as WalkEntry;
  /** Results that must not be kept: the next request tries again. */
  let transient = false;
  const run = async (): Promise<AlarmWalkthrough> => {
    const ready = await modelReady(cfg);
    if (!ready.ready) {
      transient = true;
      return finish({ status: "passages-only", answer: null, model: null, reason: ready.reason });
    }
    const lib = await resolveLibrary(cfg);
    const r = await retrieved(event, lib, cfg, blackout);
    if (!r.hits.length) return finish({ status: "no-answer", answer: null, model: null });
    const freshness = await libraryFreshness(r.source, lib, cfg);
    try {
      const outcome = await modelAnswer({
        question: walkthroughQuestion(event, blackout),
        hits: r.hits,
        crew: null,
        libraryAgeText: freshness.libraryAgeText,
        stale: freshness.stale,
        groundLinkUp: !blackout,
        source: r.source,
        lib,
        cfg,
      });
      if (outcome.ok) return finish({ status: "answered", answer: dropLeadIn(outcome.text), model: cfg.llmModel });
      if (outcome.kind === "no-answer") return finish({ status: "no-answer", answer: null, model: cfg.llmModel });
      return finish({ status: "passages-only", answer: null, model: null, reason: outcome.reason });
    } catch (err) {
      if (err instanceof AssistantBusyError) return finish({ status: "busy", answer: null, model: null });
      throw err;
    }
  };

  holder.__demifyWalkthroughsRunning = running + 1;
  entry.promise = run()
    .catch((err: unknown): AlarmWalkthrough => {
      console.error(`[demify] Alarm walk-through failed: ${err instanceof Error ? err.message : String(err)}`);
      return finish({ status: "passages-only", answer: null, model: null, reason: PASSAGES_ONLY_REASON.failed });
    })
    .then((w) => {
      // "busy" and "no model ready" are not kept: the next request tries again. Everything else is the answer for this alarm.
      if (w.status === "busy" || transient) walks.delete(key);
      else entry.done = w;
      return w;
    })
    .finally(() => {
      holder.__demifyWalkthroughsRunning = Math.max(0, (holder.__demifyWalkthroughsRunning ?? 1) - 1);
    });
  walks.set(key, entry);
  return { kind: "walkthrough", walkthrough: await entry.promise, started: true };
}
