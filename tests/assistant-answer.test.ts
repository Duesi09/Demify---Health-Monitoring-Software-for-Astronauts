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
    librarySyncInfo: vi.fn(),
    searchBundled: vi.fn(),
    dbQuery: vi.fn(),
    db: { down: false as false | string },
    assess: vi.fn(),
    live: vi.fn(),
    listCrew: vi.fn(),
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
  librarySyncInfo: mocks.librarySyncInfo,
  searchBundled: mocks.searchBundled,
}));
vi.mock("@onboard/db.mjs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@onboard/db.mjs")>()),
  getPool: () => ({
    query: async (sql: string, params?: unknown[]) => {
      if (mocks.db.down) throw new Error(mocks.db.down);
      return mocks.dbQuery(sql, params);
    },
  }),
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
  mocks.listCrew.mockImplementation(async () => DEFAULT_CREW);
  return { listCrew: (...args: unknown[]) => mocks.listCrew(...args), getCrew: async (id: string) => DEFAULT_CREW.find((c) => c.id === id) };
});
vi.mock("@/lib/health/assess", () => ({ assessCrewMember: mocks.assess }));
vi.mock("@/lib/monitor/live", () => ({ getLiveVitals: mocks.live }));

import { askAssistant, AssistantBusyError, EXCERPT_MAX, excerpt, MAX_CONCURRENT_CHATS, resetAssistantState } from "@/lib/assistant/answer";
import { libraryFreshness, libraryListing, libraryStatus, resetLibrarySourceState, resolveLibrary, syncNow } from "@/lib/assistant/library-source";
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
const syncedAgo = (ms: number) => ({ lastGroundSync: new Date(Date.now() - ms).toISOString(), seededAt: null });

beforeAll(async () => {
  actualSearchBundled = (await vi.importActual<typeof import("@onboard/library.mjs")>("@onboard/library.mjs")).searchBundled;
});

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-assistant-"));
  resetLibrarySourceState();
  resetAssistantState();
  mocks.link.up = true;
  for (const m of [mocks.chat, mocks.embed, mocks.modelStatus, mocks.searchLibrary, mocks.syncLibrary, mocks.librarySyncInfo, mocks.searchBundled, mocks.dbQuery, mocks.assess, mocks.live]) {
    m.mockReset();
  }
  mocks.listCrew.mockClear();
  mocks.db.down = false;
  mocks.searchBundled.mockImplementation((...args: Parameters<typeof actualSearchBundled>) => actualSearchBundled(...args));
  mocks.modelStatus.mockResolvedValue(READY);
  mocks.dbQuery.mockImplementation(async (sql: string) =>
    /count\(\*\)::int AS n FROM library_documents/.test(sql) ? { rows: [{ n: POOL_DOCS }] } : { rows: [] },
  );
  mocks.librarySyncInfo.mockResolvedValue(syncedAgo(14 * HOUR));
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
    mocks.chat.mockResolvedValue("Start the emergency checklist [2]. Call the crew [1][2][7].");
    const a = await askAssistant({ question: VF }, onboard());
    expect(a.status).toBe("answered");
    expect(a.answer).toBe(`${ACT_NOW_LINE}\n\nStart the emergency checklist [2]. Call the crew [1][2].`);
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
    // The whole verified chunk travels with the citation.
    expect(a.citations[0].text).toBe(hit(1).text);
    expect(a.mode).toEqual({ retrieval: "vector", model: "gpt-oss:20b", groundLink: "up" });
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 14 hours ago", stale: false, crewDataAt: null, groundLinkUp: true });

    // The model saw the numbered passages and the rules.
    const [, messages] = mocks.chat.mock.calls[0];
    expect(messages[0].content).toMatch(/reply exactly NO_ANSWER/);
    expect(messages[1].content).toContain("[1] Document 1 › Section 1");
    expect(messages[1].content).toContain("[3] Document 3 › Section 3");
    expect(messages[1].content).toContain("Library status: last synced 14 hours ago.");
    expect(messages[1].content).toMatch(/<question>\nThe monitor shows ventricular fibrillation\. What does the drill checklist say\?\n<\/question>$/);
    // Vector search with the short question-embedding limit.
    expect(mocks.searchLibrary.mock.calls[0][4]).toEqual({ skipVector: false, embedTimeoutMs: 3000 });
  });

  it("an answer without a valid citation is not shown", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1), hit(2)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist [5].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", answer: null, reason: PASSAGES_ONLY_REASON.uncited });
    expect(a.citations.map((c) => c.n)).toEqual([1, 2]);
    expect(a.mode.model).toBeNull();
    expect(a.mode.fallbackReason).toMatch(/cited no passage that exists/);
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

  it("answers in the bundled setup with a model too (no database, no embeddings)", async () => {
    mocks.chat.mockResolvedValue("The pulse oximeter is listed in the medical kit inventory [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, withModel());
    expect(a.status).toBe("answered");
    expect(a.citations.map((c) => c.docId)).toEqual(["med-kit-inventory"]);
    expect(a.mode).toEqual({ retrieval: "bundled", model: "gpt-oss:20b", groundLink: "up" });
    expect(a.freshness.libraryAgeText).toMatch(/^bundled with this release/);
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.searchLibrary).not.toHaveBeenCalled();
  });

  it("withholds an answer that cites crew data [C] when no crew member was selected", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist [1]. The heart rate is high [C].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.uncited });
  });

  it("withholds an answer with more than one uncited sentence", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist [1]. Then rest. Then eat.");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.uncited });
    expect(a.mode.fallbackReason).toMatch(/2 statements of the model answer had no citation/);
  });
});

describe("grounding check (a real model may copy words from the question)", () => {
  // "placebin" is a made-up medicine name; the question is not blocked (it names no request, amount or medicine word).
  const QUESTION = "Is placebin safe in the radiation shelter during a solar storm?";

  it("withholds an answer that copies a question word no passage contains (bundled library)", async () => {
    mocks.chat.mockResolvedValue("Placebin is not covered; during a solar storm move to the radiation shelter [1].");
    const a = await askAssistant({ question: QUESTION }, withModel());
    expect(a).toMatchObject({ status: "passages-only", answer: null, reason: PASSAGES_ONLY_REASON.ungrounded });
    expect(a.citations.length).toBeGreaterThan(0);
    expect(a.mode.model).toBeNull();
    // The word itself is not repeated in the reason.
    expect(a.mode.fallbackReason).toBe("model answer used 1 word that no cited passage contains");
  });

  it("asks the database library about the words the cited passages lack", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Placebin is not in the library; start the emergency checklist [1].");
    const a = await askAssistant({ question: QUESTION }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.ungrounded });
    const lookup = mocks.dbQuery.mock.calls.find(([sql]) => /unnest\(\$1::text\[\]\)/.test(sql as string));
    expect(lookup?.[1]).toEqual([["placebin"]]);
  });

  it("accepts question words the library contains elsewhere", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.dbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/unnest/.test(sql)) return { rows: ((params?.[0] as string[]) ?? []).filter((w) => ["monitor", "alarms"].includes(w)).map((w) => ({ w })) };
      return /count\(\*\)::int AS n FROM library_documents/.test(sql) ? { rows: [{ n: POOL_DOCS }] } : { rows: [] };
    });
    mocks.chat.mockResolvedValue("When the monitor alarms, start the emergency checklist [1].");
    const a = await askAssistant({ question: "What do we do when the monitor alarms?" }, onboard());
    expect(a.status).toBe("answered");
  });

  it("withholds an answer that names something shaped like a medicine the passages do not contain", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Start the emergency checklist and give examprofen [1].");
    const a = await askAssistant({ question: VF }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: `${ACT_NOW_LINE} ${PASSAGES_ONLY_REASON.ungrounded}` });
  });
});

describe("model server problems", () => {
  it("skips vector search while the model server is known to be unreachable, and remembers it", async () => {
    mocks.modelStatus.mockResolvedValue({ reachable: false, available: [], llmReady: false, embedReady: false, error: "timeout" });
    mocks.searchLibrary.mockResolvedValue({ ...vector([hit(1, { tier: "fulltext", score: 0.2, text: "Pulse oximeter: medical kit A." })]), tier: "fulltext" });
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.unreachable });
    expect(mocks.searchLibrary.mock.calls[0][4]).toEqual({ skipVector: true, embedTimeoutMs: 3000 });
    // Within 30 s the next question does not ask the model server again.
    await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(mocks.modelStatus).toHaveBeenCalledTimes(1);
    expect(mocks.searchLibrary.mock.calls[1][4]).toEqual({ skipVector: true, embedTimeoutMs: 3000 });
  });

  it("does not skip vector search when only the language model is missing", async () => {
    mocks.modelStatus.mockResolvedValue({ ...READY, available: ["nomic-embed-text"], llmReady: false });
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(mocks.searchLibrary.mock.calls[0][4]).toEqual({ skipVector: false, embedTimeoutMs: 3000 });
  });

  it("an unreachable chat call is remembered: the next question skips the model at once", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockRejectedValue(new mocks.ModelError("unreachable", "connect ECONNREFUSED"));
    const first = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(first.reason).toBe(PASSAGES_ONLY_REASON.unreachable);
    const second = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(second.reason).toBe(PASSAGES_ONLY_REASON.unreachable);
    expect(mocks.chat).toHaveBeenCalledTimes(1);
    expect(mocks.modelStatus).toHaveBeenCalledTimes(1);
    expect(mocks.searchLibrary.mock.calls[1][4]).toEqual({ skipVector: true, embedTimeoutMs: 3000 });
  });

  it(`runs at most ${MAX_CONCURRENT_CHATS} chat calls at once; a further question is told the assistant is busy`, async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    const releases: ((v: string) => void)[] = [];
    mocks.chat.mockImplementation(() => new Promise<string>((r) => releases.push(r)));
    const running = [askAssistant({ question: EXAMPLES[3][0] }, onboard()), askAssistant({ question: EXAMPLES[3][0] }, onboard())];
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    await expect(askAssistant({ question: EXAMPLES[3][0] }, onboard())).rejects.toBeInstanceOf(AssistantBusyError);
    // Questions that never reach the model are not affected.
    expect((await askAssistant({ question: "How many pills can he take?" }, onboard())).status).toBe("blocked");
    for (const r of releases) r("Answer [1].");
    expect((await Promise.all(running)).map((a) => a.status)).toEqual(["answered", "answered"]);
    mocks.chat.mockResolvedValue("Answer [1].");
    expect((await askAssistant({ question: EXAMPLES[3][0] }, onboard())).status).toBe("answered");
  });

  it("frees the chat slot when the chat call fails", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockRejectedValue(new mocks.ModelError("http", "HTTP 500", 500));
    for (let i = 0; i < MAX_CONCURRENT_CHATS + 1; i++) await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    mocks.chat.mockResolvedValue("Answer [1].");
    expect((await askAssistant({ question: EXAMPLES[3][0] }, onboard())).status).toBe("answered");
  });
});

describe("retrieval gates and integrity", () => {
  it("vector hits below DEMIFY_ASSISTANT_MIN_SCORE do not count (and weak ones need the question's words)", async () => {
    mocks.searchLibrary.mockResolvedValue(vector([hit(1, { score: 0.41, text: "Pulse oximeter: stowed in medical kit A." }), hit(2, { score: 0.2 })]));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a).toMatchObject({ status: "no-answer", reason: NO_ANSWER_LINK_UP, citations: [] });
    const lower = await askAssistant({ question: EXAMPLES[3][0] }, onboard({ DEMIFY_ASSISTANT_MIN_SCORE: "0.4" }));
    expect(lower.citations.map((c) => c.docId)).toEqual(["doc-1"]);
    // Just above the minimum, a passage without the question's words does not count.
    mocks.searchLibrary.mockResolvedValue(vector([hit(1, { score: 0.56 })]));
    const offTopic = await askAssistant({ question: NO_ANSWER_QUESTION }, onboard());
    expect(offTopic).toMatchObject({ status: "no-answer", citations: [] });
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

  it("falls back to the bundled library when the database is unreachable, and says it is the release copy", async () => {
    mocks.db.down = "connect ECONNREFUSED 127.0.0.1:5432";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.chat.mockResolvedValue("Kit A [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.status).toBe("answered");
    expect(a.mode.retrieval).toBe("bundled");
    // The driver's reason, not "no answer within 2 s".
    expect(a.mode.fallbackReason).toBe("database unreachable (connect ECONNREFUSED 127.0.0.1:5432); using the release copy bundled with the app");
    expect(a.freshness).toMatchObject({
      librarySyncedAt: null,
      libraryAgeText: "release copy bundled with the app (database unreachable)",
      stale: true,
    });
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
    mocks.dbQuery.mockImplementation(async (sql: string) => (/count\(\*\)::int AS n FROM library_documents/.test(sql) ? { rows: [{ n: 0 }] } : { rows: [] }));
    mocks.librarySyncInfo.mockResolvedValue({ lastGroundSync: null, seededAt: null });
    mocks.chat.mockResolvedValue("Kit A [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.mode.retrieval).toBe("bundled");
    expect(a.mode.fallbackReason).toMatch(/database library is empty/);
    expect(a.freshness.libraryAgeText).toBe("release copy bundled with the app (onboard library empty, not synced yet)");
    // The empty database library syncs in the background, after the crew store is initialised.
    await vi.waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledTimes(1));
    expect(mocks.listCrew.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.syncLibrary.mock.invocationCallOrder[0]);
  });
});

describe("freshness and automatic sync", () => {
  it("syncs a stale library in the background while the ground link is up, at most every 10 minutes", async () => {
    mocks.librarySyncInfo.mockResolvedValue(syncedAgo(30 * HOUR));
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    let release: (v: unknown) => void = () => {};
    mocks.syncLibrary.mockReturnValue(new Promise((r) => (release = r)));
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    // The answer did not wait for the sync.
    expect(a.status).toBe("answered");
    expect(a.freshness).toMatchObject({ libraryAgeText: "last synced 30 hours ago", stale: true });
    await vi.waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledTimes(1));
    expect(mocks.syncLibrary.mock.calls[0][2]).toEqual({ trigger: "auto", groundLinkUp: true });
    release({ status: "ok" });
    await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(1);
  });

  it("does not sync during a blackout, and the prompt says the library may be out of date", async () => {
    mocks.link.up = false;
    mocks.librarySyncInfo.mockResolvedValue(syncedAgo(3 * 24 * HOUR + 60_000));
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

  it("says when the station library was only seeded from the release copy, and syncs it while the link is up", async () => {
    mocks.librarySyncInfo.mockResolvedValue({ lastGroundSync: null, seededAt: "2026-11-14T08:00:00.000Z" });
    mocks.searchLibrary.mockResolvedValue(vector([hit(1)]));
    mocks.chat.mockResolvedValue("Answer [1].");
    const a = await askAssistant({ question: EXAMPLES[3][0] }, onboard());
    expect(a.freshness).toMatchObject({
      librarySyncedAt: null,
      libraryAgeText: "seeded from the release copy (2026-11-14); not synced from the ground yet",
      stale: true,
    });
    await vi.waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledTimes(1));
    const listing = await libraryListing(onboard());
    expect(listing.freshness.libraryAgeText).toBe("seeded from the release copy (2026-11-14); not synced from the ground yet");
    const status = await libraryStatus(onboard());
    expect(status.library.freshness.libraryAgeText).toBe("seeded from the release copy (2026-11-14); not synced from the ground yet");
  });

  it("labels the release copy during a database outage everywhere (answer, listing, status)", async () => {
    mocks.db.down = "connect ECONNREFUSED 127.0.0.1:5432";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const listing = await libraryListing(onboard());
    expect(listing.source).toBe("bundled");
    expect(listing.freshness).toEqual({ librarySyncedAt: null, libraryAgeText: "release copy bundled with the app (database unreachable)", stale: true });
    resetLibrarySourceState();
    const status = await libraryStatus(onboard());
    expect(status.database).toBe("unreachable");
    expect(status.library.freshness.libraryAgeText).toBe("release copy bundled with the app (database unreachable)");
    // Without a database at all, the laptop wording stays.
    expect((await libraryListing(laptop())).freshness.libraryAgeText).toMatch(/^bundled with this release \(\d{4}-\d{2}-\d{2}\), no sync on this machine$/);
    const lib = await resolveLibrary(laptop());
    expect((await libraryFreshness("bundled", lib, laptop())).stale).toBe(false);
  });

  it("Sync now initialises the crew store before the library sync (crew baselines on a fresh database)", async () => {
    mocks.syncLibrary.mockResolvedValue({ status: "ok" });
    const out = await syncNow(onboard());
    expect(out.ok).toBe(true);
    expect(mocks.listCrew).toHaveBeenCalled();
    expect(mocks.listCrew.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.syncLibrary.mock.invocationCallOrder[0]);
    expect(mocks.syncLibrary.mock.calls[0][2]).toEqual({ trigger: "manual", groundLinkUp: true });
    // A crew store that fails does not stop the sync.
    mocks.listCrew.mockRejectedValueOnce(new Error("store down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await syncNow(onboard())).ok).toBe(true);
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(2);
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
    expect(excerpt("  short\n text ")).toBe("short\ntext");
  });

  // Checker C2 MAJOR 2: the excerpt shows the line that answers the question.
  it.each([
    [EXAMPLES[3][0], /Pulse oximeter, fingertip: stowed in /],
    [EXAMPLES[0][0], /ventricular fibrillation|VF/i],
    [EXAMPLES[2][0], /shelter/i],
  ])("in the laptop setup show the words of %j", async (question, re) => {
    const a = await askAssistant({ question }, laptop());
    const c = a.citations[0];
    expect(c.excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX);
    expect(c.excerpt).toMatch(re);
    // The whole passage is there for "Show the whole passage".
    expect(c.text.length).toBeGreaterThanOrEqual(c.excerpt.replace(/…/g, "").length);
    expect(c.text).toContain(c.excerpt.replace(/^…|…$/g, "").split("\n")[0]);
  });
});
