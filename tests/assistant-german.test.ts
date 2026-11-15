import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import {
  GERMAN_GLOSSARY,
  GERMAN_STOPWORDS,
  germanTerm,
  germanToEnglish,
  inventoryDoc,
  readLibraryDir,
  searchBundled,
  searchLibrary,
} from "@onboard/library.mjs";

/**
 * German questions against the English library: the reviewed glossary in
 * onboard/library.mjs expands a German question for the keyword searches
 * (bundled and full-text), the relevance gate counts it with its English,
 * and a German model answer may repeat glossary words of the question.
 */

const mocks = vi.hoisted(() => ({
  link: { up: true },
  chat: vi.fn(),
  modelStatus: vi.fn(),
}));

vi.mock("@onboard/model.mjs", () => ({
  chat: mocks.chat,
  embed: vi.fn(),
  modelStatus: mocks.modelStatus,
  ModelError: class extends Error {},
}));
vi.mock("@/lib/onboard/ground-link", () => ({
  isGroundLinkUp: async () => mocks.link.up,
  getGroundLink: async () => ({ up: mocks.link.up, switchedUp: mocks.link.up, forcedOffline: false, changedAt: new Date(0).toISOString(), backend: "file" }),
}));
vi.mock("@/lib/store/readings", async () => {
  const { DEFAULT_CREW } = await import("@/lib/store/readings-json");
  return { listCrew: async () => DEFAULT_CREW, getCrew: async (id: string) => DEFAULT_CREW.find((c) => c.id === id) };
});

import { askAssistant, resetAssistantState } from "@/lib/assistant/answer";
import { germanBackedRemoved, germanWordBacked } from "@/lib/assistant/german";
import { resetLibrarySourceState } from "@/lib/assistant/library-source";
import { searchQuestion, termCoverage } from "@/lib/assistant/relevance";
import { DOSE_PATTERN, MEDICINE_STEM, stemSet } from "@/lib/assistant/safety";
import { GERMAN_HINT } from "@/lib/assistant/wording";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The example questions of the UI, in English and in German, and the document that must answer both. */
const EXAMPLES: [english: string, german: string, docId: string][] = [
  [
    "The monitor shows ventricular fibrillation. What does the drill checklist say?",
    "Der Monitor zeigt Kammerflimmern. Was sagt die Drill-Checkliste?",
    "alarm-response",
  ],
  ["Blood pressure is 185/115. When do we contact the flight surgeon?", "Der Blutdruck ist 185/115. Wann kontaktieren wir den Flugarzt?", "vital-sign-ranges"],
  [
    "A solar storm is starting. What is the radiation shelter procedure?",
    "Ein Sonnensturm beginnt. Wie ist das Verfahren für den Strahlenschutzraum?",
    "space-radiation",
  ],
  ["Where is the pulse oximeter in the medical kit?", "Wo ist das Pulsoximeter im Medizinkit?", "med-kit-inventory"],
  ["What is the commander's resting heart rate baseline?", "Was ist der Ruhepuls-Ausgangswert des Kommandanten?", "crew-baselines"],
  [
    "The ground link is down. How do we handle a medical event during the blackout?",
    "Der Bodenkontakt ist unterbrochen. Wie gehen wir während des Blackouts mit einem medizinischen Notfall um?",
    "ground-link-blackout",
  ],
];
/** The blood pressure question may also be answered by the hypertensive crisis checklist (as in English). */
const ALSO_OK: Record<string, string[]> = { "vital-sign-ranges": ["alarm-response"] };

let dataDir: string;
const laptop = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir });
const withModel = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir, DEMIFY_MODEL_URL: "http://model.test/v1", DEMIFY_LLM_MODEL: "gemma3:4b" });

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-german-"));
  resetLibrarySourceState();
  resetAssistantState();
  mocks.link.up = true;
  mocks.chat.mockReset();
  mocks.modelStatus.mockReset();
  mocks.modelStatus.mockResolvedValue({ reachable: true, available: ["gemma3:4b"], llmReady: true, embedReady: false });
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("German glossary", () => {
  it("translates the terms the team asked for", () => {
    const cases: [string, RegExp][] = [
      ["Pulsoximeter", /pulse oximeter/],
      ["Blutdruck", /blood pressure/],
      ["Puls", /heart rate/],
      ["Herzfrequenz", /heart rate/],
      ["Kammerflimmern", /ventricular fibrillation/],
      ["Herzinfarkt", /heart attack STEMI/],
      ["Schlaganfall", /stroke/],
      ["Krampfanfall", /seizure/],
      ["Anfall", /seizure/],
      ["Strahlung", /radiation/],
      ["Sonnensturm", /solar storm/],
      ["Medizinkit", /medical kit/],
      ["Notfallkoffer", /medical kit/],
      ["Sauerstoff", /oxygen/],
      ["Fieber", /fever temperature/],
      ["Temperatur", /temperature/],
      ["Atmung", /respiration/],
      ["Bodenkontakt", /ground link/],
      ["Funkverbindung", /ground link/],
      ["Blackout", /blackout/],
      ["Flugarzt", /flight surgeon/],
      ["Flugärztin", /flight surgeon/],
      ["Defibrillator", /defibrillator AED/],
      ["Schutzraum", /shelter/],
      ["CO2", /carbon dioxide/],
    ];
    for (const [de, en] of cases) expect(germanTerm(de), de).toMatch(en);
  });

  it("resolves inflected forms and compounds", () => {
    expect(germanTerm("Blutdrucks")).toBe("blood pressure");
    expect(germanTerm("Kommandanten")).toBe("commander");
    expect(germanTerm("Anfälle")).toBe("seizure");
    expect(germanTerm("Strahlenschutzraum")).toBe("radiation shelter");
    expect(germanTerm("Blutdruckwerte")).toBe("blood pressure");
    expect(germanTerm("Fahrrad")).toBeNull();
  });

  it("leaves English questions alone (no translation, no dropped words)", () => {
    for (const [english] of EXAMPLES) expect(germanToEnglish(english), english).toBeNull();
    expect(germanToEnglish("What is the best treatment for a kidney stone?")).toBeNull();
    expect(germanToEnglish("What was the heart rate in the drill?")).toBeNull();
  });

  it("turns a German question into its English search words", () => {
    expect(germanToEnglish("Wo ist das Pulsoximeter im Medizinkit?")).toBe("pulse oximeter medical kit");
    expect(germanToEnglish("Der Blutdruck ist 185/115. Wann kontaktieren wir den Flugarzt?")).toBe("blood pressure 185 115 contact flight surgeon");
    expect(searchQuestion("Wo ist das Pulsoximeter im Medizinkit?")).toBe("pulse oximeter medical kit");
  });

  it("names no medicine and no dose, and every key is folded", () => {
    for (const [de, en] of Object.entries(GERMAN_GLOSSARY)) {
      expect(de).toMatch(/^[a-z0-9]+$/);
      expect(`${de} ${en}`, de).not.toMatch(MEDICINE_STEM);
      expect(`${de} ${en}`, de).not.toMatch(DOSE_PATTERN);
    }
    for (const w of GERMAN_STOPWORDS) expect(w).toMatch(/^[a-z]+$/);
  });
});

describe("German example questions find the right document", () => {
  it.each(EXAMPLES)("bundled keyword search: %j / German version", async (english, german, docId) => {
    const { docs, inventory } = await readLibraryDir(path.join(ROOT, "library"));
    const all = [...docs, inventoryDoc(inventory, "2026-11-14")];
    if (docId === "crew-baselines") return; // generated from the crew table; covered by askAssistant below
    const en = searchBundled(all, english, 3);
    const de = searchBundled(all, german, 3);
    expect([docId, ...(ALSO_OK[docId] ?? [])]).toContain(de.hits[0]?.docId);
    expect(de.hits[0]?.docId).toBe(en.hits[0]?.docId);
    expect(termCoverage(german, `${de.hits[0].title} ${de.hits[0].heading} ${de.hits[0].text}`)).toBeGreaterThanOrEqual(0.6);
  });

  it.each(EXAMPLES)("the assistant (no model) shows the passages for the German version of %j", async (_english, german, docId) => {
    const a = await askAssistant({ question: german }, laptop());
    expect(a.status).toBe("passages-only");
    expect(a.citations.length).toBeGreaterThan(0);
    expect([docId, ...(ALSO_OK[docId] ?? [])]).toContain(a.citations[0].docId);
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("full-text search (database library) gets the English terms of a German question", async () => {
    const query = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>(async () => ({ rows: [] }));
    const pool = { query } as unknown as Parameters<typeof searchLibrary>[0];
    await searchLibrary(pool, onboardConfig({}), "Wo ist das Pulsoximeter im Medizinkit?", 5);
    const fulltext = query.mock.calls.find(([sql]) => /to_tsquery/.test(sql));
    expect(fulltext?.[1][0]).toBe("pulse | oximeter | medical | kit");
    query.mockClear();
    await searchLibrary(pool, onboardConfig({}), "Where is the pulse oximeter in the medical kit?", 5);
    expect(query.mock.calls.find(([sql]) => /to_tsquery/.test(sql))?.[1][0]).toBe("pulse | oximeter | medical | kit");
  });
});

describe("German answers (the model answers in the language of the question)", () => {
  it("accepts glossary words of the question whose English the passages contain", () => {
    const backed = stemSet(["Pulse oximeter: Medical Diagnostics Pack. Ventricular fibrillation checklist."]);
    expect(germanWordBacked("Pulsoximeter", backed)).toBe(true);
    expect(germanWordBacked("Kammerflimmern", backed)).toBe(true);
    expect(germanWordBacked("Schlaganfall", backed)).toBe(false);
    expect(germanWordBacked("Zauberwort", backed)).toBe(false);
    expect(germanBackedRemoved(["pulsoximeter", "zauberwort"], ["pulse oximeter"])).toEqual(["zauberwort"]);
  });

  it("shows a cited German answer that repeats the question's German terms", async () => {
    mocks.chat.mockResolvedValue("Das Pulsoximeter liegt im Medical Diagnostics Pack (MDP) des Medizinkits [1].");
    const a = await askAssistant({ question: "Wo ist das Pulsoximeter im Medizinkit?" }, withModel());
    expect(a.status).toBe("answered");
    expect(a.answer).toContain("Pulsoximeter");
    expect(a.citations[0].docId).toBe("med-kit-inventory");
    // The prompt still asks the model to answer in the language of the question.
    const [, messages] = mocks.chat.mock.calls[0] as [unknown, { role: string; content: string }[]];
    expect(messages[0].content).toContain("Answer in the language of the question.");
    expect(messages[1].content).toContain("<question>\nWo ist das Pulsoximeter im Medizinkit?\n</question>");
  });

  it("still withholds a German answer that copies a question word the library does not contain", async () => {
    mocks.chat.mockResolvedValue("Das Pulsoximeter liegt neben dem Zauberkasten im Medizinkit [1].");
    const a = await askAssistant({ question: "Liegt das Pulsoximeter neben dem Zauberkasten im Medizinkit?" }, withModel());
    expect(a.status).toBe("passages-only");
    expect(a.answer).toBeNull();
  });

  it("has a short UI hint", () => {
    expect(GERMAN_HINT).toBe("The library is in English; German questions work for common terms.");
  });
});
