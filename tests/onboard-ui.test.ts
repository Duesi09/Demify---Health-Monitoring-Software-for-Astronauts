import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerCard } from "@/components/onboard/answer-card";
import {
  EXAMPLE_QUESTIONS,
  GROUND_LINK_DOWN_BANNER,
  OUT_OF_LIBRARY_EXAMPLE,
  QUESTION_MAX,
  QUESTION_MIN,
  STATUS_HEADING,
  answerBlocks,
  citationTitle,
  databaseText,
  durationText,
  expiryState,
  freshnessLine,
  groundLinkBanner,
  groundLinkChange,
  groundLinkLabel,
  kitItemNote,
  modeLine,
  modelStateText,
  passagesOnlyKind,
  questionProblem,
  retrievalModeText,
  retrievalText,
  shortVersion,
  splitActNow,
  splitMarkers,
  syncBlockedReason,
  syncDetailText,
  syncResultText,
  utcDateTime,
  utcTime,
} from "@/components/onboard/format";
import { QUESTION_MAX as API_QUESTION_MAX, QUESTION_MIN as API_QUESTION_MIN } from "@/lib/assistant/answer";
import { ACT_NOW_LINE, ASSISTANT_NOTICE, PASSAGES_ONLY_REASON } from "@/lib/assistant/wording";
import type { AssistantAnswer, Citation, OnboardStatus } from "@/lib/onboard/types";

const ROOT = path.resolve(import.meta.dirname, "..");

function citation(n: number, over: Partial<Citation> = {}): Citation {
  return {
    n,
    docId: `doc-${n}`,
    title: "Alarm response",
    heading: "Ventricular fibrillation",
    category: "protocol",
    source: "Demify project",
    license: "MIT",
    reviewed: "Project text, not clinically reviewed",
    version: "0123456789abcdef0123456789abcdef",
    sha256: "fedcba9876543210",
    excerpt: "Start the drill checklist.",
    score: 0.8,
    ...over,
  };
}

function answer(over: Partial<AssistantAnswer> = {}): AssistantAnswer {
  return {
    status: "answered",
    answer: "Start the checklist [1].",
    citations: [citation(1)],
    freshness: {
      librarySyncedAt: "2026-11-13T22:00:00.000Z",
      libraryAgeText: "last synced 14 hours ago",
      stale: false,
      crewDataAt: null,
      groundLinkUp: true,
    },
    mode: { retrieval: "vector", model: "gpt-oss:20b", groundLink: "up" },
    integrityFailures: 0,
    askedAt: "2026-11-14T12:05:00.000Z",
    notice: ASSISTANT_NOTICE,
    ...over,
  };
}

describe("question limits", () => {
  it("match POST /api/assistant", () => {
    expect(QUESTION_MIN).toBe(API_QUESTION_MIN);
    expect(QUESTION_MAX).toBe(API_QUESTION_MAX);
  });

  it("accepts 3..500 characters after trimming", () => {
    expect(questionProblem("  hi ")).toMatch(/at least 3/);
    expect(questionProblem("abc")).toBeNull();
    expect(questionProblem("x".repeat(500))).toBeNull();
    expect(questionProblem("x".repeat(501))).toMatch(/500 characters \(it has 501\)/);
  });

  it("offers the six example questions and one the library cannot answer", () => {
    expect(EXAMPLE_QUESTIONS).toHaveLength(6);
    expect(EXAMPLE_QUESTIONS[0]).toBe("The monitor shows ventricular fibrillation. What does the drill checklist say?");
    expect(EXAMPLE_QUESTIONS[5]).toBe("The ground link is down. How do we handle a medical event during the blackout?");
    expect(OUT_OF_LIBRARY_EXAMPLE).toBe("What is the best treatment for a kidney stone?");
    for (const q of [...EXAMPLE_QUESTIONS, OUT_OF_LIBRARY_EXAMPLE]) expect(questionProblem(q)).toBeNull();
  });
});

describe("answer text", () => {
  it("splits off the act-now line", () => {
    expect(splitActNow(`${ACT_NOW_LINE}\n\nStart the checklist [1].`)).toEqual({ actNow: ACT_NOW_LINE, rest: "Start the checklist [1]." });
    expect(splitActNow(`${ACT_NOW_LINE} ${PASSAGES_ONLY_REASON.unreachable}`).rest).toBe(PASSAGES_ONLY_REASON.unreachable);
    expect(splitActNow("Plain answer [1].")).toEqual({ actNow: null, rest: "Plain answer [1]." });
    expect(splitActNow(null)).toEqual({ actNow: null, rest: "" });
  });

  it("turns '- ' lines into a list and keeps paragraphs", () => {
    const blocks = answerBlocks("The checklist says [1]:\n- Call the crew [1]\n- Start compressions\n  without delay [2]\n\nThe flight surgeon decides [2].");
    expect(blocks).toEqual([
      { kind: "p", text: "The checklist says [1]:" },
      { kind: "ul", items: ["Call the crew [1]", "Start compressions without delay [2]"] },
      { kind: "p", text: "The flight surgeon decides [2]." },
    ]);
    expect(answerBlocks("1. First step [1]\n2) Second step [1]\n### Note\nDone.")).toEqual([
      { kind: "ol", items: ["First step [1]", "Second step [1]"] },
      { kind: "h", text: "Note" },
      { kind: "p", text: "Done." },
    ]);
    expect(answerBlocks("")).toEqual([]);
  });

  it("splits [n] markers into citation links, keeps unknown ones as text", () => {
    expect(splitMarkers("Shelter now [1][2].", [1, 2])).toEqual([
      { kind: "text", text: "Shelter now " },
      { kind: "cite", n: 1 },
      { kind: "cite", n: 2 },
      { kind: "text", text: "." },
    ]);
    expect(splitMarkers("See [1, 3] and [9].", [1, 3])).toEqual([
      { kind: "text", text: "See " },
      { kind: "cite", n: 1 },
      { kind: "cite", n: 3 },
      { kind: "text", text: " and [9]." },
    ]);
    expect(splitMarkers("Values [C].", [1], true)).toEqual([{ kind: "text", text: "Values " }, { kind: "crew" }, { kind: "text", text: "." }]);
    expect(splitMarkers("Values [C].", [1], false)).toEqual([{ kind: "text", text: "Values [C]." }]);
  });

  it("supports **bold** with markers inside and never interprets HTML", () => {
    expect(splitMarkers("**Act now [1]** then wait", [1])).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "Act now " }, { kind: "cite", n: 1 }] },
      { kind: "text", text: " then wait" },
    ]);
    expect(splitMarkers("<b>x</b> [1]", [1])).toEqual([{ kind: "text", text: "<b>x</b> " }, { kind: "cite", n: 1 }]);
  });
});

describe("freshness and mode lines", () => {
  it("states library age, ground link and crew data under every answer", () => {
    const a = answer({
      freshness: { ...answer().freshness, groundLinkUp: false, crewDataAt: "2026-11-14T12:03:10.000Z" },
      crewContext: { crewId: "cdr", crewName: "Commander", summary: "…", takenAt: "2026-11-14T12:03:10.000Z", source: "SIMULATED" },
    });
    expect(freshnessLine(a)).toBe("Library last synced 14 hours ago · Ground link down (blackout) · Crew data: SIMULATED 12:03 UTC");
    expect(freshnessLine(answer())).toBe("Library last synced 14 hours ago · Ground link up · No crew data used");
    const bundled = answer({
      freshness: { ...answer().freshness, libraryAgeText: "bundled with this release (2026-11-14), no sync on this machine" },
    });
    expect(freshnessLine(bundled)).toMatch(/^Library bundled with this release \(2026-11-14\), no sync on this machine · /);
  });

  it("says who answered, from how many passages, and how they were found", () => {
    const four = [1, 2, 3, 4].map((n) => citation(n));
    expect(modeLine(answer({ citations: four }))).toBe(
      "Answered by gpt-oss:20b on this server from 4 library passages · Onboard database, vector search",
    );
    expect(modeLine(answer())).toMatch(/from 1 library passage ·/);
    const offline = answer({
      status: "passages-only",
      answer: null,
      reason: `${ACT_NOW_LINE} ${PASSAGES_ONLY_REASON.unreachable}`,
      mode: { retrieval: "bundled", model: null, groundLink: "down" },
    });
    expect(modeLine(offline)).toBe("Model offline: showing the matching library passages · No database: bundled library, keyword search");
    expect(passagesOnlyKind(PASSAGES_ONLY_REASON.notConfigured)).toBe("not-configured");
    expect(passagesOnlyKind(PASSAGES_ONLY_REASON.missing("gpt-oss:20b"))).toBe("offline");
    expect(passagesOnlyKind(PASSAGES_ONLY_REASON.dose)).toBe("withheld");
    expect(passagesOnlyKind(PASSAGES_ONLY_REASON.uncited)).toBe("withheld");
    expect(passagesOnlyKind(PASSAGES_ONLY_REASON.timeout)).toBe("timeout");
    expect(modeLine(answer({ status: "blocked", answer: null, citations: [] }))).toMatch(/^Not searched/);
    expect(modeLine(answer({ status: "no-answer", answer: null, citations: [], mode: { retrieval: "fulltext", model: null, groundLink: "up" } }))).toBe(
      "No library passage matches the question well enough · Onboard database, full-text search",
    );
  });

  it("names the bundled-library fallback reason", () => {
    expect(retrievalModeText({ retrieval: "bundled" })).toBe("No database: bundled library, keyword search");
    expect(retrievalModeText({ retrieval: "bundled", fallbackReason: "database unreachable (ECONNREFUSED); using the library bundled with this release" })).toMatch(
      /^Database unreachable/,
    );
    expect(
      retrievalModeText({ retrieval: "bundled", fallbackReason: "the onboard database library is empty (not synced yet); using the library bundled with this release" }),
    ).toMatch(/^Database library empty/);
  });

  it("has a heading per answer status", () => {
    expect(STATUS_HEADING).toEqual({
      answered: "Answered from the library",
      "passages-only": "Library passages only",
      "no-answer": "No good answer in the library",
      blocked: "Not answered by this prototype",
    });
  });
});

describe("status strip", () => {
  const model = (state: OnboardStatus["model"]["state"], available: string[] = []): OnboardStatus["model"] => ({
    state,
    url: state === "not-configured" ? null : "http://model:11434/v1",
    llm: "gpt-oss:20b",
    embed: "nomic-embed-text",
    available,
  });

  it("describes the model state", () => {
    expect(modelStateText(model("ready"))).toBe("gpt-oss:20b ready on this server");
    expect(modelStateText(model("unreachable"))).toBe("Model offline: library passages only");
    expect(modelStateText(model("not-configured"))).toBe("No model configured: library passages only");
    expect(modelStateText(model("missing-models", ["nomic-embed-text"]))).toBe("gpt-oss:20b not loaded: library passages only");
    expect(modelStateText(model("missing-models", ["gpt-oss:20b"]))).toMatch(/ready on this server, nomic-embed-text not loaded/);
  });

  it("describes the database and the retrieval mode", () => {
    expect(databaseText("connected")).toBe("PostgreSQL connected");
    expect(databaseText("not-configured")).toBe("No database: bundled library");
    const library = (source: "database" | "bundled", chunks = 40, pending = 0): OnboardStatus["library"] => ({
      source,
      documents: 9,
      chunks,
      pendingEmbeddings: pending,
      freshness: { librarySyncedAt: null, libraryAgeText: "never synced", stale: true },
      lastSync: null,
    });
    expect(retrievalText({ library: library("bundled"), model: model("not-configured") })).toBe("Keyword search over the bundled library");
    expect(retrievalText({ library: library("database"), model: model("ready") })).toMatch(/^Vector search/);
    expect(retrievalText({ library: library("database", 40, 40), model: model("ready") })).toBe("Full-text search (PostgreSQL)");
    expect(retrievalText({ library: library("database"), model: model("unreachable") })).toBe("Full-text search (PostgreSQL)");
  });

  it("shows the ground-link banner only while the link is down", () => {
    expect(groundLinkBanner(null)).toBeNull();
    expect(groundLinkBanner({ up: true, forcedOffline: false })).toBeNull();
    expect(groundLinkBanner({ up: false, forcedOffline: false })).toBe(GROUND_LINK_DOWN_BANNER);
    expect(GROUND_LINK_DOWN_BANNER).toBe(
      "Ground link down (simulated blackout): Demify is working from the onboard library and the last data snapshots.",
    );
    expect(groundLinkBanner({ up: false, forcedOffline: true })).toMatch(/offline mode/);
    expect(groundLinkLabel({ up: true })).toBe("Ground link up");
    expect(groundLinkLabel({ up: false })).toBe("Ground link down");
    expect(groundLinkChange({ switchedUp: true, changedAt: new Date(0).toISOString() })).toBe("Never switched (starts up)");
    expect(groundLinkChange({ switchedUp: false, changedAt: "2026-11-14T12:03:00Z", changedBy: "operator" })).toBe(
      "Switched down 2026-11-14 12:03 UTC by operator",
    );
  });
});

describe("library page helpers", () => {
  it("formats versions, titles, times and durations", () => {
    expect(shortVersion("0123456789abcdef")).toBe("01234567");
    expect(citationTitle({ title: "Alarm response", heading: "Ventricular fibrillation" })).toBe("Alarm response › Ventricular fibrillation");
    expect(citationTitle({ title: "Alarm response", heading: "Alarm response › VF" })).toBe("Alarm response › VF");
    expect(citationTitle({ title: "Alarm response", heading: "" })).toBe("Alarm response");
    expect(utcDateTime("2026-11-14T09:06:18.482Z")).toBe("2026-11-14 09:06 UTC");
    expect(utcDateTime("nope")).toBe("unknown time");
    expect(utcTime("2026-11-14T09:06:18Z", "2026-11-14T23:00:00Z")).toBe("09:06 UTC");
    expect(utcTime("2026-11-13T09:06:18Z", "2026-11-14T23:00:00Z")).toBe("2026-11-13 09:06 UTC");
    expect(durationText("2026-11-14T09:00:00Z", "2026-11-14T09:00:01.234Z")).toBe("1.2 s");
    expect(durationText("2026-11-14T09:00:00Z", "2026-11-14T09:03:04Z")).toBe("3 min 04 s");
    expect(durationText("2026-11-14T09:00:00Z", null)).toBe("running");
    expect(durationText("2026-11-14T09:00:00.000Z", "2026-11-14T09:00:00.040Z")).toBe("< 0.1 s");
  });

  it("summarises sync runs", () => {
    expect(
      syncDetailText({
        kind: "library",
        status: "ok",
        detail: { docsAdded: 2, docsUpdated: 0, docsRemoved: 0, docsUnchanged: 7, chunksEmbedded: 30, chunksPendingEmbedding: 0 },
      }),
    ).toBe("Documents: 2 added, 7 unchanged · 30 passages embedded");
    expect(syncDetailText({ kind: "library", status: "ok", detail: { docsAdded: 9, docsUnchanged: 0, chunksEmbedded: 88 } })).toBe(
      "Documents: 9 added · 88 passages embedded",
    );
    expect(syncDetailText({ kind: "library", status: "ok", detail: { docsAdded: 0, docsUnchanged: 0 } })).toBe("No changes");
    expect(syncDetailText({ kind: "library", status: "skipped", detail: { reason: "Ground link is down (blackout): nothing to sync from" } })).toBe(
      "Ground link is down (blackout): nothing to sync from",
    );
    expect(syncDetailText({ kind: "snapshots", status: "ok", detail: { refreshed: 3, total: 4 } })).toBe("3 of 4 data feeds refreshed");
    expect(syncResultText({ status: "ok", docsAdded: 0, docsUpdated: 1, docsRemoved: 0, docsUnchanged: 8, chunksEmbedded: 0, chunksPendingEmbedding: 3 })).toBe(
      "Library synced. Documents: 1 updated, 8 unchanged · 3 passages waiting for embedding.",
    );
    expect(syncResultText({ status: "skipped", reason: "Another library sync is running" })).toBe("Sync skipped: Another library sync is running");
  });

  it("disables Sync now with the reason", () => {
    expect(syncBlockedReason({ up: false }, "connected")).toBe("Ground link is down (blackout): nothing to sync from.");
    expect(syncBlockedReason({ up: true }, "not-configured")).toMatch(/^No database on this machine/);
    expect(syncBlockedReason({ up: true }, "unreachable")).toMatch(/unreachable/);
    expect(syncBlockedReason({ up: true }, "connected")).toBeNull();
  });

  it("marks expired and soon-expiring kit items and drops the repeated training note", () => {
    expect(expiryState(undefined, "2026-11-14")).toBeNull();
    expect(expiryState("2026-11-13", "2026-11-14")).toBe("expired");
    expect(expiryState("2026-12-01", "2026-11-14")).toBe("soon");
    expect(expiryState("2027-06-01", "2026-11-14")).toBe("ok");
    expect(kitItemNote("Representative training inventory, not the real ISS kit.")).toBeNull();
    expect(kitItemNote("Representative training inventory, not the real ISS kit. Backup cuff.")).toBe("Backup cuff.");
  });
});

describe("answer card rendering", () => {
  it("renders answer text as text and [n] markers as links to the citation list", () => {
    const html = renderToStaticMarkup(
      createElement(AnswerCard, {
        entry: {
          key: "a1",
          question: "VF?",
          answer: answer({
            answer: `${ACT_NOW_LINE}\n\nStart the checklist [1].\n- <img src=x onerror=alert(1)> step [1]`,
            freshness: { ...answer().freshness, stale: true },
            integrityFailures: 2,
          }),
        },
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('href="#a1-cite-1"');
    expect(html).toContain('id="a1-cite-1"');
    expect(html).toContain(ACT_NOW_LINE);
    expect(html).toContain("<ul");
    expect(html).toContain("Library last synced 14 hours ago · Ground link up · No crew data used");
    expect(html).toContain("checksum verified");
    expect(html).toContain("01234567");
    expect(html).not.toContain("0123456789abcdef0123");
    expect(html).toContain("Project text, not clinically reviewed");
    expect(html).toContain("2 library passages were");
    expect(html).toContain("Library may be out of date");
    expect(html).toContain("Advises, never decides.");
  });
});

describe("answer card crew context", () => {
  const crewContext = { crewId: "plt", crewName: "Pilot", summary: "Pilot. Overall status: caution.", takenAt: "2026-11-14T12:03:00Z", source: "SIMULATED" };
  const render = (text: string) =>
    renderToStaticMarkup(createElement(AnswerCard, { entry: { key: "a2", question: "BP?", answer: answer({ answer: text, crewContext }) } }));

  it("links [C] to the crew data and shows it open when the answer cites it", () => {
    const html = render("Systolic is high [C]; contact the flight surgeon [1].");
    expect(html).toContain('href="#a2-crew"');
    expect(html).toMatch(/<details[^>]*id="a2-crew"[^>]*open=""/);
    expect(html).toContain("Crew data used as context: Pilot");
    expect(html).toContain("Crew data: SIMULATED 12:03 UTC");
  });

  it("keeps the crew data collapsed when the answer does not cite it", () => {
    const html = render("Contact the flight surgeon [1].");
    expect(html).not.toContain('href="#a2-crew"');
    expect(html).not.toMatch(/<details[^>]*id="a2-crew"[^>]*open=""/);
  });
});

describe("onboard UI wording", () => {
  const files = [
    "src/app/assistant/page.tsx",
    "src/app/library/page.tsx",
    ...readdirSync(path.join(ROOT, "src/components/onboard")).map((f) => `src/components/onboard/${f}`),
  ].filter((f) => statSync(path.join(ROOT, f)).isFile());

  it("never injects HTML and uses the agreed words", () => {
    for (const f of files) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML/);
      expect(src, f).not.toMatch(/\binternet\b/i);
      expect(src, f).not.toMatch(/AI[\s-]+powered|decision[\s-]+support|not a medical device|\bdetects\b|\bdiagnoses\b/i);
    }
  });
});
