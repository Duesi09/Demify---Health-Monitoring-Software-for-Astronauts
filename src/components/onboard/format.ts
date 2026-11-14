import { ACT_NOW_LINE, PASSAGES_ONLY_REASON } from "@/lib/assistant/wording";
import type {
  AssistantAnswer,
  Citation,
  GroundLinkState,
  LibraryCategory,
  MedKitItem,
  OnboardStatus,
  SyncRunSummary,
} from "@/lib/onboard/types";
import type { Status } from "@/lib/types";

/**
 * Pure helpers of the onboard assistant and library pages: wording of the
 * status strip, the freshness and mode lines under every answer, and the
 * safe parsing of answer text (paragraphs, "- " lists, [n] citation
 * markers) into plain data that components render as React text. Nothing
 * here produces HTML. No React, no server imports.
 */

/* ------------------------------------------------------------------------- */
/* Questions                                                                  */
/* ------------------------------------------------------------------------- */

/** Same limits as POST /api/assistant (src/lib/assistant/answer.ts). */
export const QUESTION_MIN = 3;
export const QUESTION_MAX = 500;

/** One-click example questions; the onboard library answers each with citations. */
export const EXAMPLE_QUESTIONS = [
  "The monitor shows ventricular fibrillation. What does the drill checklist say?",
  "Blood pressure is 185/115. When do we contact the flight surgeon?",
  "A solar storm is starting. What is the radiation shelter procedure?",
  "Where is the pulse oximeter in the medical kit?",
  "What is the commander's resting heart rate baseline?",
  "The ground link is down. How do we handle a medical event during the blackout?",
] as const;

/** A question the library does not cover: the assistant says so instead of guessing. */
export const OUT_OF_LIBRARY_EXAMPLE = "What is the best treatment for a kidney stone?";

/** Why a question cannot be sent yet, or null. */
export function questionProblem(question: string): string | null {
  const n = question.trim().length;
  if (n < QUESTION_MIN) return `Type a question of at least ${QUESTION_MIN} characters.`;
  if (n > QUESTION_MAX) return `Keep the question to ${QUESTION_MAX} characters (it has ${n}).`;
  return null;
}

/* ------------------------------------------------------------------------- */
/* Times                                                                      */
/* ------------------------------------------------------------------------- */

function validIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** "2026-11-14 12:03 UTC" ("unknown time" for an unreadable value). */
export function utcDateTime(iso: string | null | undefined): string {
  const v = validIso(iso);
  return v ? `${v.slice(0, 10)} ${v.slice(11, 16)} UTC` : "unknown time";
}

/** "12:03 UTC", with the date in front when it is not the day of `ref`. */
export function utcTime(iso: string | null | undefined, ref?: string | null): string {
  const v = validIso(iso);
  if (!v) return "unknown time";
  const r = validIso(ref);
  return r && r.slice(0, 10) !== v.slice(0, 10) ? utcDateTime(v) : `${v.slice(11, 16)} UTC`;
}

/** "0.4 s" / "12 s" / "3 min 04 s" / "running" (no end yet) / "—" (unreadable). */
export function durationText(startedAt: string, finishedAt: string | null | undefined): string {
  if (!finishedAt) return "running";
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** First letter upper case ("last synced 2 hours ago" -> "Last synced 2 hours ago"). */
export function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------------- */
/* Ground link                                                                */
/* ------------------------------------------------------------------------- */

export const GROUND_LINK_DOWN_BANNER =
  "Ground link down (simulated blackout): Demify is working from the onboard library and the last data snapshots.";
export const GROUND_LINK_OFFLINE_BANNER =
  "Ground link down (offline mode, DEMIFY_OFFLINE): Demify is working from the onboard library and the last data snapshots.";

/** The slim layout banner; null while the link is up. */
export function groundLinkBanner(state: Pick<GroundLinkState, "up" | "forcedOffline"> | null): string | null {
  if (!state || state.up) return null;
  return state.forcedOffline ? GROUND_LINK_OFFLINE_BANNER : GROUND_LINK_DOWN_BANNER;
}

/** "Ground link up" / "Ground link down". */
export function groundLinkLabel(state: Pick<GroundLinkState, "up">): string {
  return state.up ? "Ground link up" : "Ground link down";
}

/** What the current position means for the crew. */
export function groundLinkMeaning(state: Pick<GroundLinkState, "up" | "forcedOffline">): string {
  if (state.forcedOffline) {
    return "Offline mode (DEMIFY_OFFLINE): a hard air-gap, the switch cannot bring the link up. Demify works from the onboard library and the last data snapshots.";
  }
  return state.up
    ? "Normal mode: the library syncs from the ground and NOAA and NASA data are fetched when needed."
    : "Simulated blackout: Demify works from the onboard library and the last data snapshots, as during a loss of signal.";
}

/** "Switched down 12:03 UTC by operator" / "Never switched (starts up)". */
export function groundLinkChange(state: Pick<GroundLinkState, "switchedUp" | "changedAt" | "changedBy">): string {
  const t = Date.parse(state.changedAt);
  if (!Number.isFinite(t) || t <= 0) return "Never switched (starts up)";
  return `Switched ${state.switchedUp ? "up" : "down"} ${utcDateTime(state.changedAt)}${state.changedBy ? ` by ${state.changedBy}` : ""}`;
}

/* ------------------------------------------------------------------------- */
/* Status strip                                                               */
/* ------------------------------------------------------------------------- */

export function modelStateText(model: OnboardStatus["model"]): string {
  switch (model.state) {
    case "ready":
      return `${model.llm} ready on this server`;
    case "missing-models":
      return model.available.includes(model.llm)
        ? `${model.llm} ready on this server, ${model.embed} not loaded`
        : `${model.llm} not loaded: library passages only`;
    case "unreachable":
      return "Model offline: library passages only";
    default:
      return "No model configured: library passages only";
  }
}

/** Shape of the model state (never a health status: neutral unless degraded). */
export function modelStateStatus(model: OnboardStatus["model"]): Status {
  if (model.state === "ready") return "nominal";
  if (model.state === "not-configured") return "unknown";
  return "caution";
}

export function databaseText(database: OnboardStatus["database"]): string {
  if (database === "connected") return "PostgreSQL connected";
  if (database === "unreachable") return "Database unreachable: bundled library";
  return "No database: bundled library";
}

/** How the next question will be searched. */
export function retrievalText(status: Pick<OnboardStatus, "library" | "model">): string {
  if (status.library.source === "bundled") return "Keyword search over the bundled library";
  const embedReady = status.model.state === "ready" || status.model.available.includes(status.model.embed);
  if (embedReady && status.library.chunks > status.library.pendingEmbeddings) {
    return "Vector search (pgvector), full-text as fallback";
  }
  return "Full-text search (PostgreSQL)";
}

/* ------------------------------------------------------------------------- */
/* Answer text: act-now line, blocks, citation markers                        */
/* ------------------------------------------------------------------------- */

/** Splits off the "act now" line the server puts in front of answers to emergency questions. */
export function splitActNow(text: string | null | undefined): { actNow: string | null; rest: string } {
  const t = (text ?? "").trim();
  if (t.startsWith(ACT_NOW_LINE)) return { actNow: ACT_NOW_LINE, rest: t.slice(ACT_NOW_LINE.length).trim() };
  return { actNow: null, rest: t };
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/**
 * Plain-text answer -> paragraphs, headings and lists. "- " / "* " / "• "
 * lines become a bulleted list, "1. " lines a numbered list; blank lines end
 * a paragraph; an indented line continues the list item above it.
 */
export function answerBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length) blocks.push({ kind: list.kind, items: list.items });
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      flushPara();
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((bullet ?? numbered)![1].trim());
      continue;
    }
    const current = list as { kind: "ul" | "ol"; items: string[] } | null;
    if (current && /^\s+/.test(line) && current.items.length) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: "h", text: heading[1].trim() });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  /** [n]: a library passage in the citation list. */
  | { kind: "cite"; n: number }
  /** [C]: the crew data used as context. */
  | { kind: "crew" };

const MARKER = /\[\s*(\d+(?:\s*[,;]\s*\d+)*|[Cc])\s*\]/g;
const STRONG = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;

function pushText(out: Inline[], text: string): void {
  if (!text) return;
  const last = out.at(-1);
  if (last?.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
}

function splitMarkersOnly(text: string, known: ReadonlySet<number> | null, hasCrew: boolean): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(MARKER)) {
    pushText(out, text.slice(at, m.index));
    at = m.index + m[0].length;
    const body = m[1];
    if (body === "C" || body === "c") {
      if (hasCrew) out.push({ kind: "crew" });
      else pushText(out, m[0]);
      continue;
    }
    for (const part of body.split(/[,;]/)) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n > 0 && (!known || known.has(n))) out.push({ kind: "cite", n });
      else pushText(out, `[${part.trim()}]`);
    }
  }
  pushText(out, text.slice(at));
  return out;
}

/**
 * Splits text at [n] / [n, m] / [C] markers and **bold** spans. Markers of
 * passages that are not in `known` (when given) stay plain text, as does
 * [C] without crew context. The result is data for React text nodes.
 */
export function splitMarkers(text: string, known?: Iterable<number> | null, hasCrew = false): Inline[] {
  const set = known ? new Set(known) : null;
  const out: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(STRONG)) {
    for (const seg of splitMarkersOnly(text.slice(at, m.index), set, hasCrew)) {
      if (seg.kind === "text") pushText(out, seg.text);
      else out.push(seg);
    }
    out.push({ kind: "strong", children: splitMarkersOnly(m[1], set, hasCrew) });
    at = m.index + m[0].length;
  }
  for (const seg of splitMarkersOnly(text.slice(at), set, hasCrew)) {
    if (seg.kind === "text") pushText(out, seg.text);
    else out.push(seg);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Answer card wording                                                        */
/* ------------------------------------------------------------------------- */

export const STATUS_HEADING: Record<AssistantAnswer["status"], string> = {
  answered: "Answered from the library",
  "passages-only": "Library passages only",
  "no-answer": "No good answer in the library",
  blocked: "Not answered by this prototype",
};

/** "Alarm response › Ventricular fibrillation" (no repeated title). */
export function citationTitle(c: Pick<Citation, "title" | "heading">): string {
  const heading = c.heading?.trim();
  if (!heading) return c.title;
  return heading.startsWith(c.title) ? heading : `${c.title} › ${heading}`;
}

/** Document version as shown: the first 8 characters of its SHA-256. */
export function shortVersion(version: string): string {
  return version.slice(0, 8);
}

export const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  protocol: "Protocol",
  reference: "Reference",
  baseline: "Crew baseline",
  inventory: "Medical kit",
  "drug-reference": "Drug reference",
};

/**
 * "Library last synced 14 hours ago · Ground link down (blackout) · Crew
 * data: SIMULATED 12:03 UTC". Shown under every answer.
 */
export function freshnessLine(a: Pick<AssistantAnswer, "freshness" | "crewContext" | "askedAt">): string {
  const parts = [
    `Library ${a.freshness.libraryAgeText}`,
    a.freshness.groundLinkUp ? "Ground link up" : "Ground link down (blackout)",
  ];
  if (a.crewContext) {
    const at = a.crewContext.takenAt ?? a.freshness.crewDataAt;
    parts.push(`Crew data: ${a.crewContext.source}${at ? ` ${utcTime(at, a.askedAt)}` : ""}`);
  } else {
    parts.push("No crew data used");
  }
  return parts.join(" · ");
}

type PassagesOnlyKind = "not-configured" | "offline" | "timeout" | "failed" | "withheld" | "other";

/** Which PASSAGES_ONLY_REASON the server gave (the reason may start with the act-now line). */
export function passagesOnlyKind(reason: string | undefined): PassagesOnlyKind {
  const r = splitActNow(reason).rest;
  if (r.startsWith(PASSAGES_ONLY_REASON.notConfigured)) return "not-configured";
  if (r.startsWith(PASSAGES_ONLY_REASON.unreachable)) return "offline";
  if (/^The language model .+ is not loaded on the model server/.test(r)) return "offline";
  if (r.startsWith(PASSAGES_ONLY_REASON.timeout)) return "timeout";
  if (r.startsWith(PASSAGES_ONLY_REASON.failed)) return "failed";
  if (r.startsWith(PASSAGES_ONLY_REASON.uncited) || r.startsWith(PASSAGES_ONLY_REASON.dose)) return "withheld";
  return "other";
}

const PASSAGES_ONLY_MODE: Record<PassagesOnlyKind, string> = {
  "not-configured": "No model configured: showing the matching library passages",
  offline: "Model offline: showing the matching library passages",
  timeout: "Model did not answer in time: showing the matching library passages",
  failed: "Model error: showing the matching library passages",
  withheld: "Model answer withheld by the safety check: showing the matching library passages",
  other: "Showing the matching library passages",
};

/** Where the passages came from and how they were found. */
export function retrievalModeText(mode: Pick<AssistantAnswer["mode"], "retrieval" | "fallbackReason">): string {
  if (mode.retrieval === "vector") return "Onboard database, vector search";
  if (mode.retrieval === "fulltext") return "Onboard database, full-text search";
  const why = mode.fallbackReason ?? "";
  if (/database (unreachable|search failed)/i.test(why)) return "Database unreachable: bundled library, keyword search";
  if (/database library is empty/i.test(why)) return "Database library empty: bundled library, keyword search";
  return "No database: bundled library, keyword search";
}

/**
 * "Answered by gpt-oss:20b on this server from 4 library passages · Onboard
 * database, vector search" / "Model offline: showing the matching library
 * passages · No database: bundled library, keyword search".
 */
export function modeLine(a: Pick<AssistantAnswer, "status" | "citations" | "mode" | "reason">): string {
  const n = a.citations.length;
  switch (a.status) {
    case "answered":
      return `Answered by ${a.mode.model ?? "the language model"} on this server from ${plural(n, "library passage")} · ${retrievalModeText(a.mode)}`;
    case "passages-only":
      return `${PASSAGES_ONLY_MODE[passagesOnlyKind(a.reason)]} · ${retrievalModeText(a.mode)}`;
    case "no-answer":
      return `${a.mode.model ? `${a.mode.model} found no answer in the library passages` : "No library passage matches the question well enough"} · ${retrievalModeText(a.mode)}`;
    default:
      return "Not searched: this prototype never names medicines or doses";
  }
}

/* ------------------------------------------------------------------------- */
/* Library page                                                               */
/* ------------------------------------------------------------------------- */

export const MED_KIT_NOTE = "Representative training inventory, not the actual ISS medical kit.";

/** "2 each" / "1 set" / "—". */
export function quantityText(item: Pick<MedKitItem, "quantity" | "unit">): string {
  if (item.quantity == null) return "—";
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

/** Expiry of a kit item relative to today (YYYY-MM-DD): expired, within 30 days, fine, or no date. */
export function expiryState(expiresOn: string | undefined, today: string): "expired" | "soon" | "ok" | null {
  if (!expiresOn || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return null;
  const days = (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(days)) return null;
  if (days < 0) return "expired";
  return days <= 30 ? "soon" : "ok";
}

export const SYNC_TRIGGER_LABEL: Record<string, string> = {
  schedule: "Schedule",
  manual: "Sync now",
  startup: "Startup",
  cli: "Command line",
  auto: "Automatic (stale library)",
};

export const SYNC_STATUS: Record<SyncRunSummary["status"], { status: Status; label: string }> = {
  ok: { status: "nominal", label: "OK" },
  skipped: { status: "unknown", label: "Skipped" },
  running: { status: "unknown", label: "Running" },
  failed: { status: "caution", label: "Failed" },
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One line about a sync run: what changed, or why it did not run. */
export function syncDetailText(run: Pick<SyncRunSummary, "kind" | "status" | "detail">): string {
  const d = run.detail ?? {};
  const reason = typeof d.reason === "string" ? d.reason : null;
  if (run.kind === "snapshots") {
    const refreshed = num(d.refreshed);
    const total = num(d.total);
    if (refreshed != null && total != null) return `${refreshed} of ${plural(total, "data feed")} refreshed`;
    return reason ?? "—";
  }
  if (run.status === "skipped" || run.status === "failed") return reason ?? (run.status === "failed" ? "Failed" : "Skipped");
  if (run.status === "running") return "Running…";
  const changes: string[] = [];
  const added = num(d.docsAdded);
  const updated = num(d.docsUpdated);
  const removed = num(d.docsRemoved);
  const unchanged = num(d.docsUnchanged);
  if (added) changes.push(`${added} added`);
  if (updated) changes.push(`${updated} updated`);
  if (removed) changes.push(`${removed} removed`);
  if (unchanged != null) changes.push(`${unchanged} unchanged`);
  const parts = [changes.length ? `Documents: ${changes.join(", ")}` : null];
  const embedded = num(d.chunksEmbedded);
  const pending = num(d.chunksPendingEmbedding);
  if (embedded) parts.push(`${plural(embedded, "passage")} embedded`);
  if (pending) parts.push(`${plural(pending, "passage")} waiting for embedding`);
  const out = parts.filter(Boolean).join(" · ");
  return out || "No changes";
}

/** Why "Sync now" cannot run, or null. */
export function syncBlockedReason(link: Pick<GroundLinkState, "up">, database: OnboardStatus["database"]): string | null {
  if (!link.up) return "Ground link is down (blackout): nothing to sync from.";
  if (database === "not-configured") {
    return "No database on this machine: the library is the copy bundled with this release, so there is nothing to sync.";
  }
  if (database === "unreachable") return "The database is unreachable; try again when it is back.";
  return null;
}

/** What "Sync now" did, in one line. */
export function syncResultText(r: {
  status: string;
  reason?: string;
  docsAdded?: number;
  docsUpdated?: number;
  docsRemoved?: number;
  docsUnchanged?: number;
  chunksEmbedded?: number;
  chunksPendingEmbedding?: number;
}): string {
  if (r.status === "skipped") return `Sync skipped: ${r.reason ?? "another sync is running"}`;
  if (r.status === "failed") return `Sync failed: ${r.reason ?? "unknown reason"}`;
  const detail = syncDetailText({
    kind: "library",
    status: "ok",
    detail: { ...r } as Record<string, unknown>,
  });
  return `Library synced. ${detail}.`;
}
