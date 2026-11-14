import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import type { LibraryHit, SearchResult } from "@onboard/library.mjs";

/**
 * The onboard assistant's orchestration (src/lib/assistant/answer.ts) with
 * the library database, the model client and the ground link mocked. The
 * bundled library (the real files in library/) is searched for real.
 */

const mocks = vi.hoisted(() => {
  class ModelError extends Error {
    kind: string;
    status?: number;
    constructor(kind: string, message: string, status?: number) {
      super(message);
      this.kind = kind;
      this.status = status;
    }
  }
  return {
    ModelError,
    link: { up: true },
    chat: vi.fn(),
    embed: vi.fn(),
    modelStatus: vi.fn(),
    searchLibrary: vi.fn(),
    syncLibrary: vi.fn(),
    lastLibrarySync: vi.fn(),
    searchBundled: vi.fn(),
    dbQuery: vi.fn(),
    ping: vi.fn(),
    assess: vi.fn(),
    live: vi.fn(),
  };
});

vi.mock("@onboard/model.mjs", () => ({
  chat: mocks.chat,
  embed: mocks.embed,
  modelStatus: mocks.modelStatus,
  ModelError: mocks.ModelError,
}));
vi.mock("@onboard/library.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@onboard/library.mjs")>()),
  searchLibrary: mocks.searchLibrary,
  syncLibrary: mocks.syncLibrary,
  lastLibrarySync: mocks.lastLibrarySync,
  searchBundled: mocks.searchBundled,
}));
vi.mock("@onboard/db.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@onboard/db.mjs")>()),
  getPool: () => ({ query: mocks.dbQuery }),
  pingDatabase: mocks.ping,
  ensureSchema: async () => [],
}));
vi.mock("@/lib/onboard/ground-link", () => ({
  isGroundLinkUp: async () => mocks.link.up,
  getGroundLink: async () => ({
    up: mocks.link.up,
    switchedUp: mocks.link.up,
    forcedOffline: false,
    changedAt: new Date(0).toISOString(),
    backend: "file",
  }),
}));
vi.mock("@/lib/store/readings", async () => {
  const { DEFAULT_CREW } = await import("@/lib/store/readings-json");
  return { listCrew: async () => DEFAULT_CREW, getCrew: async (id: string) => DEFAULT_CREW.find((c) => c.id === id) };
});
vi.mock("@/lib/health/assess", () => ({ assessCrewMember: mocks.assess }));
vi.mock("@/lib/monitor/live", () => ({ getLiveVitals: mocks.live }));

import { askAssistant, EXCERPT_MAX, excerpt, resetAssistantState } from "@/lib/assistant/answer";
import { resetLibrarySourceState } from "@/lib/assistant/library-source";
import {
  ACT_NOW_LINE,
  ASSISTANT_NOTICE,
  BLOCKED_REASON,
  NO_ANSWER_LINK_DOWN,
  NO_ANSWER_LINK_UP,
  PASSAGES_ONLY_REASON,
} from "@/lib/assistant/wording";

/** The questions the UI offers, and the document that must answer each. */
const EXAMPLES: [question: string, docId: string][] = [
  ["The monitor shows ventricular fibrillation. What does the drill checklist say?", "alarm-response"],
  ["Blood pressure is 185/115. When do we contact the flight surgeon?", "vital-sign-ranges"],
  ["A solar storm is starting. What is the radiation shelter procedure?", "space-radiation"],
  ["Where is the pulse oximeter in the medical kit?", "med-kit-inventory"],
  ["What is the commander's resting heart rate baseline?", "crew-baselines"],
  ["The ground link is down. How do we handle a medical event during the blackout?", "ground-link-blackout"],
];
/** The blood pressure question may also be answered by the hypertensive crisis checklist. */
const ALSO_OK: Record<string, string[]> = { "vital-sign-ranges": ["alarm-response"] };
const NO_ANSWER_QUESTION = "What is the best treatment for a kidney stone?";
const VF = EXAMPLES[0][0];

const HOUR = 3_600_000;
const POOL_DOCS = 9;

let dataDir: string;
let actualSearchBundled: typeof import("@onboard/library.mjs").searchBundled;

/** No database, no model (the laptop setup). */
const laptop = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir });
/** No database, a model server. */
const withModel = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir, DEMIFY_MODEL_URL: "http://model.test/v1" });
/** Database and model server (the onboard server). */
const onboard = (env: Record<string, string> = {}): OnboardConfig =>
  onboardConfig({ DEMIFY_DATA_DIR: dataDir, DATABASE_URL: "postgres://db.test/demify", DEMIFY_MODEL_URL: "http://model.test/v1", ...env });

function hit(n: number, over: Partial<LibraryHit> = {}): LibraryHit {
  const text = `Passage ${n} text. Start the emergency checklist and call the crew. ${"More procedure text. ".repeat(30)}`;
  return {
    docId: `doc-${n}`,
    title: `Document ${n}`,
    category: "protocol",
    source: "Demify project text",
    license: "Project text, MIT",
    reviewed: "Project text, not clinically reviewed",
    version: `version-${n}`,
    heading: `Document ${n} › Section ${n}`,
    text,
    sha256: `sha-${n}`,
    score: 0.8 - n / 100,
    tier: "vector",
    syncedAt: "2026-11-15T01:00:00.000Z",
    integrityOk: true,
    ...over,
  };
}

const vector = (hits: LibraryHit[], over: Partial<SearchResult> = {}): SearchResult => ({ tier: "vector", hits, integrityFailures: 0, ...over });

const READY = { reachable: true, available: ["gpt-oss:20b", "nomic-embed-text"], llmReady: true, embedReady: true };

beforeAll(async () => {
  actualSearchBundled = (await vi.importActual<typeof import("@onboard/library.mjs")>("@onboard/library.mjs")).searchBundled;
});

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-assistant-"));
  resetLibrarySourceState();
  resetAssistantState();
  mocks.link.up = true;
  for (const m of [mocks.chat, mocks.embed, mocks.modelStatus, mocks.searchLibrary, mocks.syncLibrary, mocks.lastLibrarySync, mocks.searchBundled, mocks.dbQuery, mocks.ping, mocks.assess, mocks.live]) {
    m.mockReset();
  }
  mocks.searchBundled.mockImplementation((...args: Parameters<typeof actualSearchBundled>) => actualSearchBundled(...args));
  mocks.modelStatus.mockResolvedValue(READY);
  mocks.ping.mockResolvedValue(true);
  mocks.dbQuery.mockImplementation(async (sql: string) =>
    /FROM library_documents/.test(sql) ? { rows: [{ n: POOL_DOCS }] } : { rows: [] },
  );
  mocks.lastLibrarySync.mockResolvedValue(new Date(Date.now() - 14 * HOUR).toISOString());
  mocks.syncLibrary.mockResolvedValue({ status: "ok" });
  mocks.assess.mockResolvedValue(null);
  mocks.live.mockResolvedValue(null);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("laptop setup: bundled library, no model", () => {
  it.each(EXAMPLES)("shows the passages that answer %j (%s)", async (question, docId) => {
    const a = await askAssistant({ question }, laptop());
    expect(a.status).toBe("passages-only");
    expect(a.answer).toBeNull();
    expect(a.citations.length).toBeGreaterThan(0);
    expect([docId, ...(ALSO_OK[docId] ?? [])]).toContain(a.citations[0].docId);
    expect(a.citations.map((c) => c.n)).toEqual(a.citations.map((_, i) => i + 1));
    for (const c of a.citations) {
      expect(c.excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX);
      expect(c.reviewed).toBe("Project text, not clinically reviewed");
      expect(c.version).toMatch(/^[0-9a-f]{64}$/);
      expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(a.mode).toEqual({ retrieval: "bundled", model: null, groundLink: "up", fallbackReason: "no language model configured" });
    expect(a.freshness.libraryAgeText).toMatch(/^bundled with this release \(\d{4}-\d{2}-\d{2}\), no sync on this machine$/);
    expect(a.freshness.stale).toBe(false);
    expect(a.notice).toBe(ASSISTANT_NOTICE);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.searchLibrary).not.toHaveBeenCalled();
  });

  it("explains why there is no model answer, and puts the act-now line first for an emergency", async () => {
    const a = await askAssistant({ question: VF }, laptop());
    expect(a.reason).toBe(`${ACT_NOW_LINE} ${PASSAGES_ONLY_REASON.notConfigured}`);
    const calm = await askAssistant({ question: EXAMPLES[3][0] }, laptop());
    expect(calm.reason).toBe(PASSAGES_ONLY_REASON.notConfigured);
  });

  it("says the library has no good answer instead of guessing", async () => {
    const a = await askAssistant({ question: NO_ANSWER_QUESTION }, laptop());
    expect(a).toMatchObject({ status: "no-answer", answer: null, reason: NO_ANSWER_LINK_UP, citations: [] });
    mocks.link.up = false;
    const down = await askAssistant({ question: NO_ANSWER_QUESTION }, laptop());
    expect(down).toMatchObject({ status: "no-answer", reason: NO_ANSWER_LINK_DOWN });
    expect(down.mode.groundLink).toBe("down");
    expect(down.freshness.groundLinkUp).toBe(false);
  });
});

describe("blocked questions", () => {
  it("never answers a medicine or dose question and never searches for one", async () => {
    const a = await askAssistant({ question: "How many pills should he take for the pain?" }, withModel());
    expect(a).toMatchObject({ status: "blocked", answer: null, reason: BLOCKED_REASON, citations: [] });
    expect(a.mode.model).toBeNull();
    expect(mocks.searchBundled).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("still puts the act-now line first when the question names an emergency", async () => {
    const a = await askAssistant({ question: "Which medication do we give for chest pain?" }, withModel());
    expect(a.status).toBe("blocked");
    expect(a.reason).toBe(`${ACT_NOW_LINE} ${BLOCKED_REASON}`);
  });
});

describe("with a model", () => {
  it("answers from the passages, keeps valid markers and maps citations to passages", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1), hit(2), hit(3)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist [2]. Call the crew [1][2]. Ignore [7].");
    const a = await askAssistant({ question: VF }, onboard());
    expect(a.status).toBe("answered");
    expect(a.answer).toBe(`${ACT_NOW_LINE}\n\nStart the emergency checklist [2]. Call the crew [1][2]. Ignore.`);
    expect(a.citations.map((c) => [c.n, c.docId])).toEqual([
      [1, "doc-1"],
      [2, "doc-2"],
    ]);
    expect(a.citations[0]).toMatchObject({
      title: "Document 1",
      heading: "Document 1 › Section 1",
      category: "protocol",
      source: "Demify project text",
      license: "Project text, MIT",
      reviewed: "Project text, not clinically reviewed",
      version: "version-1",
      sha256: "sha-1",
      score: 0.79,
      syncedAt: "2026-11-15T01:00:00.000Z",
    });
    expect(a.citations[0].excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(a.citations[0].excerpt.endsWith("…")).toBe(true);
    expect(a.mode).toEqual({ retrieval: "vector", model: "gpt-oss:20b", groundLink: "up" });
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 14 hours ago", stale: false, crewDataAt: null, groundLinkUp: true });

    // The model saw the numbered passages and the rules.
    const [, messages] = mocks.chat.mock.calls[0];
    expect(messages[0].content).toMatch(/reply exactly NO_ANSWER/);
    expect(messages[1].content).toContain("[1] Document 1 › Section 1");
    expect(messages[1].content).toContain("[3] Document 3 › Section 3");
    expect(messages[1].content).toContain("Library status: last synced 14 hours ago.");
  });

  it("an answer without a valid citation is not shown", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1), hit(2)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist [5].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", answer: null, reason: PASSAGES_ONLY_REASON.uncited });
    expect(a.citations.map((c) => c.n)).toEqual([1, 2]);
    expect(a.mode.model).toBeNull();
    expect(a.mode.fallbackReason).toMatch(/no valid citation/);
  });

  it("an answer with a dose pattern is not shown", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Take 2 tablets [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.dose });
    expect(a.citations).toHaveLength(1);
  });

  it("NO_ANSWER from the model means no answer", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("NO_ANSWER");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "no-answer", answer: null, reason: NO_ANSWER_LINK_UP, citations: [] });
    expect(a.mode.model).toBe("gpt-oss:20b");
  });

  it("shows the passages when the model server is unreachable or the model is missing", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.modelStatus.mockResolvedValue({ reachable: false, available: [], llmReady: false, embedReady: false, error: "connection refused" });
    const down = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(down).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.unreachable });
    expect(down.mode.fallbackReason).toMatch(/language model unreachable \(connection refused\)/);
    expect(mocks.chat).not.toHaveBeenCalled();

    resetAssistantState();
    mocks.modelStatus.mockResolvedValue({ ...READY, available: ["nomic-embed-text"], llmReady: false });
    const missing = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(missing.reason).toBe(PASSAGES_ONLY_REASON.missing("gpt-oss:20b"));
  });

  it.each([
    ["timeout", PASSAGES_ONLY_REASON.timeout],
    ["unreachable", PASSAGES_ONLY_REASON.unreachable],
    ["http", PASSAGES_ONLY_REASON.failed],
    ["bad-response", PASSAGES_ONLY_REASON.failed],
  ])("shows the passages when the chat call fails (%s)", async (kind, reason) => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockRejectedValue(new mocks.ModelError(kind, `chat failed: ${kind}`, kind === "http" ? 500 : undefined));
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason, answer: null });
    expect(a.citations).toHaveLength(1);
  });

  it("answers in the bundled setup with a model too", async () => {
    mocks.chat.mockResolvedValue("The pulse oximeter is listed in the medical kit inventory [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, withModel());
    expect(a.status).toBe("answered");
    expect(a.citations.map((c) => c.docId)).toEqual(["med-kit-inventory"]);
    expect(a.mode).toEqual({ retrieval: "bundled", model: "gpt-oss:20b", groundLink: "up" });
  });
});

describe("retrieval gates and integrity", () => {
  it("vector hits below DEMIFY_ASSISTANT_MIN_SCORE do not count", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1, { score: 0.41 }), hit(2, { score: 0.2 })]));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "no-answer", reason: NO_ANSWER_LINK_UP, citations: [] });
    const lower = await askAssistant({ question: EXAMPLES[3][0] }, onboard({ DEMIFY_ASSISTANT_MIN_SCORE: "0.4" }));
    expect(lower.citations.map((c) => c.docId)).toEqual(["doc-1"]);
  });

  it("reports chunks dropped for a checksum mismatch and never cites them", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1), hit(2, { integrityOk: false })], { integrityFailures: 2 }));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.integrityFailures).toBe(2);
    expect(a.citations.map((c) => c.docId)).toEqual(["doc-1"]);
  });

  it("passes on why a better tier was not used", async () => {
    mocks.searchLibrary.mockResolvedValue({
      tier: "fulltext",
      hits: [hit(1, { tier: "fulltext", score: 0.1, text: "Pulse oximeter: stowed in medical kit A." })],
      integrityFailures: 0,
      fallbackReason: "embedding model unreachable (connection refused)",
    });
    mocks.chat.mockResolvedValue("It is in kit A [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.status).toBe("answered");
    expect(a.mode).toEqual({
      retrieval: "fulltext",
      model: "gpt-oss:20b",
      groundLink: "up",
      fallbackReason: "embedding model unreachable (connection refused)",
    });
  });

  it("falls back to the bundled library when the database is unreachable", async () => {
    mocks.ping.mockResolvedValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.chat.mockResolvedValue("Kit A [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.status).toBe("answered");
    expect(a.mode.retrieval).toBe("bundled");
    expect(a.mode.fallbackReason).toMatch(/^database unreachable/);
    expect(a.freshness.libraryAgeText).toMatch(/^bundled with this release/);
    expect(mocks.searchLibrary).not.toHaveBeenCalled();
    expect(mocks.syncLibrary).not.toHaveBeenCalled();
  });

  it("falls back to the bundled library when the database search fails", async () => {
    mocks.searchLibrary.mockRejectedValue(new Error("connection terminated"));
    mocks.chat.mockResolvedValue("Kit A [1].");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.mode.retrieval).toBe("bundled");
    expect(a.mode.fallbackReason).toMatch(/database search failed \(connection terminated\)/);
    expect(a.citations[0].docId).toBe("med-kit-inventory");
  });

  it("uses the bundled library while the database library is still empty", async () => {
    mocks.dbQuery.mockImplementation(async (sql: string) => (/FROM library_documents/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [] }));
    mocks.lastLibrarySync.mockResolvedValue(null);
    mocks.chat.mockResolvedValue("Kit A [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.mode.retrieval).toBe("bundled");
    expect(a.mode.fallbackReason).toMatch(/database library is empty/);
    // The empty database library syncs in the background.
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(1);
  });
});

describe("freshness and automatic sync", () => {
  it("syncs a stale library in the background while the ground link is up, at most every 10 minutes", async () => {
    mocks.lastLibrarySync.mockResolvedValue(new Date(Date.now() - 30 * HOUR).toISOString());
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    let release: (v: unknown) => void = () => {};
    mocks.syncLibrary.mockReturnValue(new Promise((r) => (release = r)));
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    // The answer did not wait for the sync.
    expect(a.status).toBe("answered");
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 30 hours ago", stale: true });
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(1);
    expect(mocks.syncLibrary.mock.calls[0][2]).toEqual({ trigger: "auto", groundLinkUp: true });
    release({ status: "ok" });
    await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(1);
  });

  it("does not sync during a blackout, and the prompt says the library may be out of date", async () => {
    mocks.link.up = false;
    mocks.lastLibrarySync.mockResolvedValue(new Date(Date.now() - 3 * 24 * HOUR - 60_000).toISOString());
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 3 days ago", stale: true, groundLinkUp: false });
    expect(a.mode.groundLink).toBe("down");
    expect(mocks.syncLibrary).not.toHaveBeenCalled();
    const user = mocks.chat.mock.calls[0][1][1].content as string;
    expect(user).toContain("Library status: last synced 3 days ago; the library may be out of date.");
    expect(user).toMatch(/Ground link status: down \(blackout\)/);
  });

  it("does not sync a fresh library", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(mocks.syncLibrary).not.toHaveBeenCalled();
  });
});

describe("crew context", () => {
  const takenAt = "2026-11-15T14:58:00.000Z";
  const liveAt = "2026-11-15T14:59:30.000Z";
  const crew = { id: "cdr", name: "Commander", role: "Commander", baseline: { heartRate: 62 } };

  beforeEach(() => {
    mocks.assess.mockResolvedValue({
      crew,
      overall: "caution",
      assessments: [
        { indicator: "heartRate", status: "caution", value: 112, unit: "bpm", takenAt, finding: "Heart rate elevated", actions: [], escalate: false },
        { indicator: "spo2", status: "nominal", value: 98, unit: "%", takenAt, finding: "Normal", actions: [], escalate: false },
      ],
      regions: {},
      escalations: [],
      sources: { heartRate: "manual", spo2: "simulated" },
      scenario: null,
    });
    mocks.live.mockResolvedValue({
      crewId: "cdr",
      crewName: "Commander",
      t: liveAt,
      hr: 74,
      rhythm: "sinus",
      stMm: 0,
      pvcPerMin: 0,
      sys: 118,
      dia: 76,
      map: 90,
      spo2: 98,
      resp: 14,
      temp: 36.7,
      source: "simulated",
      activity: "rest",
      scenario: null,
      alarms: [],
    });
  });

  it("adds the crew member's status and latest live sample as [C], with its data label", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("The heart rate is in caution [C]; follow the checklist [1].");
    const a = await askAssistant({ question: EXAMPLES[4][0], crewId: "cdr" }, onboard());
    expect(a.status).toBe("answered");
    expect(a.crewContext).toMatchObject({ crewId: "cdr", crewName: "Commander", takenAt: liveAt, source: "SIMULATED" });
    expect(a.crewContext!.summary).toContain("Overall status from the rule engine: caution.");
    expect(a.crewContext!.summary).toContain("Heart rate 112 bpm (caution, Crew entry, 2026-11-15 14:58 UTC): Heart rate elevated");
    expect(a.crewContext!.summary).toContain("Latest live sample (SIMULATED, 2026-11-15 14:59 UTC): heart rate 74 bpm (sinus), blood pressure 118/76 mmHg");
    expect(a.crewContext!.summary).not.toContain("SpO₂ 98 % (nominal");
    expect(a.freshness.crewDataAt).toBe(liveAt);
    const user = mocks.chat.mock.calls[0][1][1].content as string;
    expect(user).toContain(`Crew data [C] (SIMULATED, ${liveAt}):`);
    expect(user).toContain("Overall status from the rule engine: caution.");
  });

  it("works without a live sample and labels the readings", async () => {
    mocks.live.mockResolvedValue(null);
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[4][0], crewId: "cdr" }, onboard());
    expect(a.crewContext).toMatchObject({ takenAt, source: "Crew entry" });
  });

  it("answers without crew context when the crew data cannot be read", async () => {
    mocks.assess.mockRejectedValue(new Error("store down"));
    mocks.live.mockRejectedValue(new Error("store down"));
    const a = await askAssistant({ question: EXAMPLES[3][0], crewId: "cdr" }, laptop());
    expect(a.crewContext).toBeUndefined();
    expect(a.freshness.crewDataAt).toBeNull();
  });
});

describe("excerpts", () => {
  it("are at most 300 characters and cut at a word", () => {
    const long = `${"word ".repeat(100)}end`;
    const e = excerpt(long);
    expect(e.length).toBeLessThanOrEqual(300);
    expect(e.endsWith("word…")).toBe(true);
    expect(excerpt("  short\n text ")).toBe("short text");
  });
});
