import { describe, expect, it } from "vitest";
import type { LibraryHit, SearchResult } from "@onboard/library.mjs";
import { agoText, ageText, bundledAgeText, bundledFreshness, databaseFreshness, isStale } from "@/lib/assistant/freshness";
import { buildMessages, SYSTEM_PROMPT, userMessage } from "@/lib/assistant/prompt";
import { termCoverage, usableHits } from "@/lib/assistant/relevance";
import { blockedReason, checkAnswer, containsDose, isEmergency } from "@/lib/assistant/safety";
import {
  ACT_NOW_LINE,
  ASSISTANT_NOTICE,
  BLOCKED_REASON,
  NO_ANSWER_LINK_DOWN,
  NO_ANSWER_LINK_UP,
  PASSAGES_ONLY_REASON,
} from "@/lib/assistant/wording";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

/**
 * The pure parts of the onboard assistant: question safety rules, the
 * answer check, freshness texts, the relevance gate and the prompt.
 */

/** The questions the UI offers (the library answers each with a citation). */
const EXAMPLES = [
  "The monitor shows ventricular fibrillation. What does the drill checklist say?",
  "Blood pressure is 185/115. When do we contact the flight surgeon?",
  "A solar storm is starting. What is the radiation shelter procedure?",
  "Where is the pulse oximeter in the medical kit?",
  "What is the commander's resting heart rate baseline?",
  "The ground link is down. How do we handle a medical event during the blackout?",
];
const NO_ANSWER_QUESTION = "What is the best treatment for a kidney stone?";

/** Wording the spec bans in anything the crew reads. */
const BANNED = [/AI[\s-]+powered/i, /decision[\s-]+support/i, /not a medical device/i, /\bdetects?\b/i, /\bdiagnoses\b/i, /\binternet\b/i, /\bthe (first|only)\b/i];

describe("blocked questions", () => {
  it.each([
    "What medication should we give for chest pain?",
    "Which drug helps with space motion sickness?",
    "How much should I take for a headache?",
    "How many pills can he take?",
    "What can we give him for the pain?",
    "Can you prescribe something for sleep?",
    "What is the right dose for a crew member with a fever?",
    "What dosage is safe?",
    "Is 2 tablets enough?",
    "Welches Medikament hilft gegen Kopfschmerzen?",
    "Where is the prescription list?",
  ])("blocks %j", (q) => {
    expect(blockedReason(q)).toBe(BLOCKED_REASON);
  });

  it.each([...EXAMPLES, NO_ANSWER_QUESTION, "What is the radiation dose limit for a career?", "What is the dose rate on the ISS?", "Where is the medical kit stowed?"])(
    "answers %j",
    (q) => {
      expect(blockedReason(q)).toBeNull();
    },
  );

  it("says why in plain words, without naming any medicine", () => {
    expect(BLOCKED_REASON).toBe(
      "This prototype never names medicines or doses. Ask the flight surgeon; during a blackout follow your mission's medical procedures.",
    );
  });
});

describe("emergency questions", () => {
  it.each([
    EXAMPLES[0],
    "He is not breathing!",
    "She is unconscious after the EVA",
    "Possible cardiac arrest in node 2",
    "Monitor shows VF",
    "Sudden chest pain during exercise",
    "The pilot collapsed",
  ])("names an emergency: %j", (q) => {
    expect(isEmergency(q)).toBe(true);
  });

  it.each([EXAMPLES[2], EXAMPLES[3], EXAMPLES[4], NO_ANSWER_QUESTION, "What is the ventilation rate in the cabin?"])("no emergency: %j", (q) => {
    expect(isEmergency(q)).toBe(false);
  });

  it("the act-now line puts the checklist and the crew before the assistant", () => {
    expect(ACT_NOW_LINE).toMatch(/emergency checklist/);
    expect(ACT_NOW_LINE).toMatch(/alert the crew/);
    expect(ACT_NOW_LINE).toMatch(/Do not wait for the assistant/);
  });
});

describe("answer check", () => {
  it("keeps valid markers, removes markers out of range and lists what was cited", () => {
    const r = checkAnswer("Start the checklist [1]. Call the flight surgeon [3][7]. Crew data agrees [C].", 3);
    expect(r).toEqual({ ok: true, text: "Start the checklist [1]. Call the flight surgeon [3]. Crew data agrees [C].", cited: [1, 3] });
    const gone = checkAnswer("See the procedure [9].", 3);
    expect(gone.ok).toBe(false);
  });

  it("normalises grouped and ranged markers", () => {
    expect(checkAnswer("A [1, 2]. B [2-3]. C 【1†source】. D [c].", 3)).toEqual({
      ok: true,
      text: "A [1][2]. B [2][3]. C [1]. D [C].",
      cited: [1, 2, 3],
    });
  });

  it("needs at least one library citation", () => {
    expect(checkAnswer("Start the emergency checklist.", 2)).toEqual({ ok: false, kind: "uncited", reason: PASSAGES_ONLY_REASON.uncited });
    expect(checkAnswer("Your heart rate is high [C].", 2)).toMatchObject({ ok: false, kind: "uncited" });
  });

  it("never shows an answer with a dose or an amount", () => {
    expect(checkAnswer("Take 2 tablets now [1].", 2)).toEqual({ ok: false, kind: "dose", reason: PASSAGES_ONLY_REASON.dose });
    expect(checkAnswer("Give 10 ml [1].", 2)).toMatchObject({ kind: "dose" });
    // Lab and radiation units are not doses.
    expect(checkAnswer("Below 54 mg/dL contact the flight surgeon [1]. Career limit 600 mSv [2].", 2)).toMatchObject({ ok: true });
    expect(containsDose("record vitals every 5 minutes")).toBe(false);
  });

  it("NO_ANSWER means the passages did not answer", () => {
    expect(checkAnswer("NO_ANSWER", 3)).toMatchObject({ ok: false, kind: "no-answer" });
    expect(checkAnswer("  NO_ANSWER.\n", 3)).toMatchObject({ ok: false, kind: "no-answer" });
    expect(checkAnswer("", 3)).toMatchObject({ ok: false, kind: "no-answer" });
  });
});

describe("freshness texts", () => {
  const now = Date.parse("2026-11-15T15:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("says how long ago the library synced", () => {
    expect(ageText(ago(14 * 3_600_000), now)).toBe("last synced 14 hours ago");
    expect(ageText(ago(20_000), now)).toBe("last synced just now");
    expect(ageText(ago(-60_000), now)).toBe("last synced just now");
    expect(ageText(ago(60_000), now)).toBe("last synced 1 minute ago");
    expect(ageText(ago(5 * 60_000), now)).toBe("last synced 5 minutes ago");
    expect(ageText(ago(3_600_000), now)).toBe("last synced 1 hour ago");
    expect(ageText(ago(47 * 3_600_000), now)).toBe("last synced 47 hours ago");
    expect(ageText(ago(3 * 86_400_000 + 5_000), now)).toBe("last synced 3 days ago");
    expect(ageText(null, now)).toBe("never synced");
    expect(agoText("garbage", now)).toBe("at an unknown time");
  });

  it("marks the library stale after the maximum age, and when it never synced", () => {
    expect(isStale(ago(23 * 3_600_000), 24, now)).toBe(false);
    expect(isStale(ago(25 * 3_600_000), 24, now)).toBe(true);
    expect(isStale(null, 24, now)).toBe(true);
    expect(databaseFreshness(ago(14 * 3_600_000), 24, now)).toEqual({
      librarySyncedAt: ago(14 * 3_600_000),
      libraryAgeText: "last synced 14 hours ago",
      stale: false,
    });
    expect(databaseFreshness(null, 24, now)).toEqual({ librarySyncedAt: null, libraryAgeText: "never synced", stale: true });
  });

  it("describes the bundled library by its release date", () => {
    expect(bundledAgeText("2026-11-14")).toBe("bundled with this release (2026-11-14), no sync on this machine");
    expect(bundledFreshness("2026-11-14")).toEqual({
      librarySyncedAt: "2026-11-14T00:00:00.000Z",
      libraryAgeText: "bundled with this release (2026-11-14), no sync on this machine",
      stale: false,
    });
    expect(bundledFreshness(null)).toEqual({ librarySyncedAt: null, libraryAgeText: "never synced", stale: true });
  });
});

describe("relevance gate", () => {
  const hit = (over: Partial<LibraryHit>): LibraryHit => ({
    docId: "d",
    title: "Alarm response drill checklists",
    category: "protocol",
    source: "Demify project text",
    license: "MIT",
    version: "v",
    heading: "Cardiac arrest (ventricular fibrillation)",
    text: "Start the emergency checklist from the drill checklist on the monitor.",
    sha256: "s",
    score: 0.6,
    tier: "vector",
    integrityOk: true,
    ...over,
  });
  const result = (hits: LibraryHit[]): SearchResult => ({ tier: hits[0]?.tier ?? "bundled", hits, integrityFailures: 0 });

  it("measures how much of the question a passage covers", () => {
    expect(termCoverage(EXAMPLES[0], "Ventricular fibrillation: drill checklist on the monitor")).toBe(1);
    expect(termCoverage(NO_ANSWER_QUESTION, "Released calcium raises kidney-stone risk")).toBe(0.5);
    expect(termCoverage("What is it?", "anything")).toBe(0);
  });

  it("vector hits need DEMIFY_ASSISTANT_MIN_SCORE", () => {
    const hits = [hit({ score: 0.71 }), hit({ score: 0.49, docId: "weak" })];
    expect(usableHits(result(hits), EXAMPLES[0], { minScore: 0.5, k: 5 }).map((h) => h.score)).toEqual([0.71]);
  });

  it("keyword hits need most of the question's words, bundled hits also a minimum score", () => {
    const kidney = hit({ tier: "fulltext", score: 0.3, text: "Released calcium raises kidney-stone risk, and so does dehydration." });
    expect(usableHits(result([kidney]), NO_ANSWER_QUESTION, { minScore: 0.5, k: 5 })).toEqual([]);
    const vf = hit({ tier: "fulltext", score: 0.05 });
    expect(usableHits(result([vf]), EXAMPLES[0], { minScore: 0.5, k: 5 })).toHaveLength(1);
    expect(usableHits(result([hit({ tier: "bundled", score: 0.2 })]), EXAMPLES[0], { minScore: 0.5, k: 5 })).toEqual([]);
    expect(usableHits(result([hit({ tier: "bundled", score: 0.4 })]), EXAMPLES[0], { minScore: 0.5, k: 5 })).toHaveLength(1);
  });

  it("drops hits that failed the checksum and keeps at most k", () => {
    const hits = [hit({ integrityOk: false }), hit({ score: 0.9 }), hit({ score: 0.8 }), hit({ score: 0.7 })];
    expect(usableHits(result(hits), EXAMPLES[0], { minScore: 0.5, k: 2 }).map((h) => h.score)).toEqual([0.9, 0.8]);
  });
});

describe("prompt", () => {
  const input = {
    question: EXAMPLES[0],
    passages: [
      {
        n: 1,
        title: "Alarm response drill checklists",
        heading: "Alarm response drill checklists › Cardiac arrest (ventricular fibrillation)",
        source: "Demify project text",
        reviewed: "Project text, not clinically reviewed",
        text: "1. Call the crew.\n[2] is not a passage marker here.",
      },
      { n: 2, title: "Escalation and signal delay", heading: "Signal delay", source: "Demify project text", text: "Call the flight surgeon." },
    ],
    crew: { source: "SIMULATED", takenAt: "2026-11-15T14:59:00.000Z", summary: "Commander. Overall status from the rule engine: critical." },
    libraryAgeText: "last synced 30 hours ago",
    stale: true,
    groundLinkUp: false,
  };

  it("states the rules: library passages and [C] only, cite everything, NO_ANSWER, no medicines, advise never decide", () => {
    expect(SYSTEM_PROMPT).toMatch(/onboard library assistant of Demify, a research prototype/);
    expect(SYSTEM_PROMPT).toMatch(/You advise; you never decide/);
    expect(SYSTEM_PROMPT).toMatch(/strictly from the numbered library passages/);
    expect(SYSTEM_PROMPT).toMatch(/crew data \[C\]/);
    expect(SYSTEM_PROMPT).toMatch(/Cite every statement/);
    expect(SYSTEM_PROMPT).toMatch(/reply exactly NO_ANSWER/);
    expect(SYSTEM_PROMPT).toMatch(/Never name a medicine, a dose, an amount or a schedule/);
    expect(SYSTEM_PROMPT).toMatch(/Never diagnose/);
    expect(SYSTEM_PROMPT).toMatch(/the crew and the flight surgeon decide/);
    expect(SYSTEM_PROMPT).toMatch(/at most 6 sentences/);
    expect(SYSTEM_PROMPT).toMatch(/language of the question/);
    expect(SYSTEM_PROMPT).toMatch(/out of date/);
    expect(SYSTEM_PROMPT).toContain(DISCLAIMER_SHORT);
  });

  it("numbers the passages, adds crew data, library status and the ground link", () => {
    const msg = userMessage(input);
    expect(msg).toContain(`Question: ${EXAMPLES[0]}`);
    expect(msg).toContain("[1] Alarm response drill checklists › Cardiac arrest (ventricular fibrillation)\n(source: Demify project text; Project text, not clinically reviewed)");
    expect(msg).toContain("[2] Escalation and signal delay › Signal delay");
    expect(msg).toContain("(2) is not a passage marker here.");
    expect(msg).toContain("Crew data [C] (SIMULATED, 2026-11-15T14:59:00.000Z):\nCommander.");
    expect(msg).toContain("Library status: last synced 30 hours ago; the library may be out of date.");
    expect(msg).toMatch(/Ground link status: down \(blackout\)/);
    expect(buildMessages(input).map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("uses none of the banned wording", () => {
    for (const text of [
      SYSTEM_PROMPT,
      userMessage(input),
      ASSISTANT_NOTICE,
      BLOCKED_REASON,
      ACT_NOW_LINE,
      NO_ANSWER_LINK_UP,
      NO_ANSWER_LINK_DOWN,
      ...Object.values(PASSAGES_ONLY_REASON).map((r) => (typeof r === "string" ? r : r("gpt-oss:20b"))),
    ]) {
      for (const re of BANNED) expect(text).not.toMatch(re);
    }
    expect(ASSISTANT_NOTICE).toBe(
      `Advises, never decides. The crew and, when the ground link is up, the flight surgeons make every medical decision. ${DISCLAIMER_SHORT}`,
    );
  });
});
