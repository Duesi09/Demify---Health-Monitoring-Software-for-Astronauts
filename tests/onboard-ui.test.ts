import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerCard } from "@/components/onboard/answer-card";
import { GroundLinkBadge, GroundLinkBanner } from "@/components/onboard/ground-link-indicators";
import {
  EXAMPLE_QUESTIONS,
  GROUND_LINK_DOWN_BANNER,
  GROUND_LINK_EXPLANATION,
  GROUND_LINK_LABEL,
  OUT_OF_LIBRARY_EXAMPLE,
  QUESTION_MAX,
  QUESTION_MIN,
  STATUS_HEADING,
  answerBlocks,
  citationTitle,
  databaseText,
  durationText,
  excerptIsWhole,
  expiryState,
  freshnessLine,
  groundLinkBanner,
  groundLinkChange,
  groundLinkLabel,
  groundLinkMeaning,
  groundLinkView,
  hostText,
  kitItemNote,
  modeLine,
  modelReady,
  modelStateStatus,
  modelStateText,
  passageBlocks,
  passagesNote,
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
    text: "Start the drill checklist.",
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

  it("names the configured model and where it runs", () => {
    expect(modelStateText(model("ready"), "connected")).toBe("gpt-oss:20b ready on this server");
    expect(modelStateText(model("ready"), "unreachable")).toBe("gpt-oss:20b ready on this server");
    expect(modelStateText({ ...model("ready"), llm: "gemma3:4b" }, "not-configured")).toBe("gemma3:4b ready on this machine");
    expect(modelStateText(model("unreachable"), "connected")).toBe("Model server offline (gpt-oss:20b): library passages only");
    expect(modelStateText(model("not-configured"), "not-configured")).toBe("No model configured: library passages only");
    expect(modelStateText(model("missing-models", ["nomic-embed-text"]), "connected")).toBe("gpt-oss:20b not loaded: library passages only");
    expect(modelStateText(model("missing-models", ["gpt-oss:20b"]), "connected")).toBe(
      "gpt-oss:20b ready on this server, nomic-embed-text not loaded",
    );
    expect(hostText("not-configured")).toBe("this machine");
    expect(hostText("connected")).toBe("this server");
  });

  it("needs no embedding model without a database (keyword search over the bundled library)", () => {
    const laptop = { ...model("missing-models", ["gemma3:4b"]), llm: "gemma3:4b" };
    expect(modelReady(laptop, "not-configured")).toBe(true);
    expect(modelStateText(laptop, "not-configured")).toBe("gemma3:4b ready on this machine");
    expect(modelStateStatus(laptop, "not-configured")).toBe("nominal");
    expect(modelReady(laptop, "connected")).toBe(false);
    expect(modelStateStatus(laptop, "connected")).toBe("caution");
    expect(modelStateStatus(model("not-configured"), "not-configured")).toBe("unknown");
    expect(modelReady({ ...model("missing-models", ["nomic-embed-text"]) }, "not-configured")).toBe(false);
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

  const link = (switchedUp: boolean, forcedOffline = false) => ({ switchedUp, forcedOffline });

  it("shows one blackout: the switch, then the conjunction profile, then the air-gapped deployment", () => {
    expect(groundLinkView(link(true))).toBe("up");
    expect(groundLinkView(link(false))).toBe("down");
    expect(groundLinkView(link(true), "conjunction")).toBe("conjunction");
    expect(groundLinkView(link(true), "Conjunction")).toBe("conjunction");
    expect(groundLinkView(link(false), "conjunction")).toBe("down");
    expect(groundLinkView(link(true, true))).toBe("air-gapped");
    expect(groundLinkView(link(true, true), "conjunction")).toBe("conjunction");
    expect(groundLinkView(link(false, true))).toBe("down");
    expect(groundLinkView(link(true), "iss")).toBe("up");
    expect(groundLinkView(link(true), "nonsense")).toBe("up");
    expect(GROUND_LINK_LABEL).toEqual({
      up: "Ground link up",
      down: "Ground link down (simulated blackout)",
      conjunction: "No contact (conjunction profile)",
      "air-gapped": "Air-gapped (offline mode)",
    });
    expect(groundLinkLabel(link(true), "conjunction")).toBe("No contact (conjunction profile)");
    expect(groundLinkLabel(link(true, true))).toBe("Air-gapped (offline mode)");
    for (const text of Object.values(GROUND_LINK_EXPLANATION)) expect(text.length).toBeGreaterThan(40);
  });

  it("shows the banner only while the switch is down, never for DEMIFY_OFFLINE alone", () => {
    expect(groundLinkBanner(null)).toBeNull();
    expect(groundLinkBanner(link(true))).toBeNull();
    expect(groundLinkBanner(link(true, true))).toBeNull();
    expect(groundLinkBanner(link(false))).toBe(GROUND_LINK_DOWN_BANNER);
    expect(groundLinkBanner(link(false, true))).toBe(GROUND_LINK_DOWN_BANNER);
    expect(GROUND_LINK_DOWN_BANNER).toBe(
      "Ground link down (simulated blackout): Demify works from the last data snapshots and the onboard library; advice follows the onboard procedures.",
    );
    expect(groundLinkChange({ switchedUp: true, changedAt: new Date(0).toISOString() })).toBe("Never switched (starts up)");
    expect(groundLinkChange({ switchedUp: false, changedAt: "2026-11-14T12:03:00Z", changedBy: "operator" })).toBe(
      "Switched down 2026-11-14 12:03 UTC by operator",
    );
  });

  it("keeps the banner's live region mounted while there is nothing to say", () => {
    // Server snapshot = no ground-link state yet: an empty, visually hidden status region.
    const html = renderToStaticMarkup(createElement(GroundLinkBanner));
    expect(html).toBe('<div role="status" class="sr-only"></div>');
  });

  it("says in the status strip that a bundled library does not sync", () => {
    expect(groundLinkMeaning("up", "not-configured")).toMatch(/bundled with this release, no sync on this machine/);
    expect(groundLinkMeaning("up", "not-configured")).not.toMatch(/syncs from the ground/);
    expect(groundLinkMeaning("up", "connected")).toMatch(/^Normal mode: the library syncs from the ground/);
    expect(groundLinkMeaning("down", "connected")).toMatch(/^Simulated blackout: no contact with the ground/);
    expect(groundLinkMeaning("down", "not-configured")).toMatch(/library bundled with this release/);
    expect(groundLinkMeaning("conjunction", "connected")).toMatch(/conjunction signal delay profile/);
    expect(groundLinkMeaning("air-gapped", "connected")).toMatch(/^Air-gapped deployment \(DEMIFY_OFFLINE\).*Not a blackout/);
  });

  it("renders ground-link badges with dark text (contrast at small sizes)", () => {
    const up = renderToStaticMarkup(createElement(GroundLinkBadge, { view: "up" }));
    expect(up).toContain("Ground link up");
    // The label colour sits on the outer span; text-nominal only colours the icon.
    const outer = /^<span class="([^"]*)"/.exec(up)?.[1].split(/\s+/) ?? [];
    expect(outer).toContain("text-fg");
    expect(outer).not.toContain("text-nominal");
    const down = renderToStaticMarkup(createElement(GroundLinkBadge, { view: "down" }));
    expect(down).toContain("Ground link down (simulated blackout)");
    expect(down).toContain("text-on-caution");
    expect(renderToStaticMarkup(createElement(GroundLinkBadge, { view: "air-gapped" }))).toContain("Air-gapped (offline mode)");
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
    expect(syncBlockedReason("down", "connected")).toBe("Ground link is down (blackout): nothing to sync from.");
    expect(syncBlockedReason("conjunction", "connected")).toBe("No contact in the conjunction profile: nothing to sync from.");
    expect(syncBlockedReason("air-gapped", "connected")).toMatch(/^Air-gapped deployment \(DEMIFY_OFFLINE\)/);
    expect(syncBlockedReason("up", "not-configured")).toMatch(/^No database on this machine/);
    expect(syncBlockedReason("up", "unreachable")).toMatch(/unreachable/);
    expect(syncBlockedReason("up", "connected")).toBeNull();
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

describe("whole library passages", () => {
  const VF = [
    'Checklist "Cardiac arrest (VF / pulseless VT)":',
    "",
    "6. Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.",
    "7. Keep this sheet: record every shock, rhythm check and **medication time**.",
    "",
    "Location: Monitoring devices pack",
    "Quantity: 1 each",
    "- Pulse oximeter, fingertip [1]",
    "- Blood pressure cuff",
    "  with spare bladder",
    "## Notes",
    "<script>alert(1)</script>",
  ].join("\n");

  it("keeps line breaks, lists (with their first number) and headings", () => {
    expect(passageBlocks(VF)).toEqual([
      { kind: "lines", lines: ['Checklist "Cardiac arrest (VF / pulseless VT)":'] },
      {
        kind: "ol",
        start: 6,
        items: [
          "Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.",
          "Keep this sheet: record every shock, rhythm check and **medication time**.",
        ],
      },
      { kind: "lines", lines: ["Location: Monitoring devices pack", "Quantity: 1 each"] },
      { kind: "ul", items: ["Pulse oximeter, fingertip [1]", "Blood pressure cuff with spare bladder"] },
      { kind: "h", text: "Notes" },
      { kind: "lines", lines: ["<script>alert(1)</script>"] },
    ]);
    expect(passageBlocks("")).toEqual([]);
    expect(passageBlocks("1.5 mmHg is not a list\r\nsecond line")).toEqual([{ kind: "lines", lines: ["1.5 mmHg is not a list", "second line"] }]);
  });

  it("knows when the excerpt already is the whole passage", () => {
    expect(excerptIsWhole("A b c.", "A\nb   c.")).toBe(true);
    expect(excerptIsWhole("A b…", "A b c d.")).toBe(false);
    expect(excerptIsWhole("A b", "")).toBe(true);
    expect(excerptIsWhole("A b", undefined)).toBe(true);
  });

  it("says 'it' for one passage and 'them' for several", () => {
    expect(passagesNote(1)).toBe("The passage below matched the question. Read it yourself; nothing was written by a model.");
    expect(passagesNote(3)).toBe("The passages below matched the question. Read them yourself; nothing was written by a model.");
  });

  it("names this machine for answers without a database, this server otherwise", () => {
    const bundled = answer({ mode: { retrieval: "bundled", model: "gemma3:4b", groundLink: "up" } });
    expect(modeLine(bundled)).toBe("Answered by gemma3:4b on this machine from 1 library passage · No database: bundled library, keyword search");
    const outage = answer({
      mode: { retrieval: "bundled", model: "gpt-oss:20b", groundLink: "up", fallbackReason: "database unreachable (ECONNREFUSED)" },
    });
    expect(modeLine(outage)).toMatch(/^Answered by gpt-oss:20b on this server from 1 library passage · Database unreachable/);
  });

  const render = (a: AssistantAnswer) => renderToStaticMarkup(createElement(AnswerCard, { entry: { key: "a3", question: "VF?", answer: a } }));

  it("offers the whole passage under a cut excerpt, rendered as text with its lists", () => {
    const html = render(
      answer({
        citations: [citation(1, { excerpt: "…Contact the flight surgeon and report…", text: VF, syncedAt: "2026-11-13T09:06:00Z" })],
      }),
    );
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>[\s\S]*Show the whole passage<\/summary>/);
    expect(html).toContain('<ol start="6"');
    expect(html).toContain("<strong");
    expect(html).toContain("Location: Monitoring devices pack<br/>Quantity: 1 each");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    // [1] inside a library passage is the library's own text, not a link to this answer's sources.
    expect(html).toContain("Pulse oximeter, fingertip [1]");
    // Synced the day before the question: the date is shown.
    expect(html).toContain("synced 2026-11-13 09:06 UTC");
  });

  it("shows a short passage whole, without a disclosure", () => {
    const html = render(answer({ citations: [citation(1, { excerpt: "Kit: - oximeter - cuff", text: "Kit:\n- oximeter\n- cuff" })] }));
    expect(html).not.toContain("Show the whole passage");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>oximeter</li>");
  });

  it("drops the repeated fallback line and keeps a visible focus on the heading", () => {
    const html = render(
      answer({
        status: "passages-only",
        answer: null,
        reason: PASSAGES_ONLY_REASON.notConfigured,
        mode: { retrieval: "bundled", model: null, groundLink: "up", fallbackReason: "no language model configured" },
      }),
    );
    expect(html).not.toContain("Fallback:");
    expect(html).toContain("Read it yourself");
    expect(html).toMatch(/<h3[^>]*tabindex="-1"[^>]*class="[^"]*focus:outline-2/);
    expect(html).not.toContain("focus:outline-none");
  });

  it("uses dark text for small labels (contrast)", () => {
    const html = render(answer({ citations: [citation(1, { url: "https://example.org/doc" })] }));
    expect(html).not.toMatch(/font-mono text-xs font-semibold text-accent/);
    expect(html).toMatch(/text-fg[^"]*"><svg[^>]*text-nominal[^>]*>[\s\S]*?<\/svg>checksum verified/);
    expect(html).toMatch(/class="[^"]*text-fg underline decoration-accent[^"]*"[^>]*>Source document/);
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
