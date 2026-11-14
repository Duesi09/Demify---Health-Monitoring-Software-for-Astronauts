import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg, { type Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { onboardConfig } from "@onboard/config.mjs";
import { closePool, ensureSchema, getPool, LOCK_SYNC } from "@onboard/db.mjs";
import {
  chunkDoc,
  crewBaselineDoc,
  crewBaselinesState,
  embedPending,
  inventoryDoc,
  lastLibrarySync,
  librarySyncInfo,
  parseDoc,
  pruneSyncRuns,
  readLibraryDir,
  refreshCrewBaselines,
  searchBundled,
  searchLibrary,
  sha256,
  syncLibrary,
  type LibraryDoc,
} from "@onboard/library.mjs";
import { INDICATORS } from "@/lib/health/knowledge";
import { buildProtocol } from "@/components/crew/protocols";

/**
 * The onboard library (onboard/library.mjs) and its curated content
 * (library/**): parsing, chunking, checksums, the wording and safety rules
 * of every document, bundled keyword search for the example questions, and
 * (with DEMIFY_TEST_DATABASE_URL) the PostgreSQL sync and retrieval.
 */

// The model client is mocked: there is no real model in tests. library.mjs
// loads it lazily, so the tests without a database never touch it.
const model = vi.hoisted(() => ({ embed: vi.fn(), modelStatus: vi.fn() }));
vi.mock("@onboard/model.mjs", () => ({
  embed: model.embed,
  modelStatus: model.modelStatus,
  chat: vi.fn(),
  ModelError: class ModelError extends Error {},
}));

const ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY = path.join(ROOT, "library");
const TEST_DB = process.env.DEMIFY_TEST_DATABASE_URL;
/**
 * The library tests run in their own schema (search_path), so they can
 * reset it freely even when other test files share the same database.
 */
const SCHEMA = "demify_library_test";
const DB_URL = TEST_DB
  ? `${TEST_DB}${TEST_DB.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${SCHEMA},public`)}`
  : undefined;

/** Same crew as the app's default crew (src/lib/store/readings*.ts). */
const CREW = [
  { id: "cdr", name: "Commander", role: "Commander", baseline: { heartRate: 62, systolicBP: 118, diastolicBP: 76, bodyTemp: 36.7, glucose: 92, spo2: 98 } },
  { id: "plt", name: "Pilot", role: "Pilot", baseline: { heartRate: 58, systolicBP: 122, diastolicBP: 78, bodyTemp: 36.6, glucose: 88, spo2: 98 } },
  { id: "ms1", name: "Mission Specialist 1", role: "Mission Specialist", baseline: { heartRate: 66, systolicBP: 112, diastolicBP: 72, bodyTemp: 36.8, glucose: 95, spo2: 99 } },
  { id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", baseline: { heartRate: 60, systolicBP: 116, diastolicBP: 74, bodyTemp: 36.7, glucose: 90, spo2: 98 } },
];

/** The questions the UI offers, and the document that must answer each. */
const EXAMPLES: [question: string, docId: string][] = [
  ["The monitor shows ventricular fibrillation. What does the drill checklist say?", "alarm-response"],
  ["Blood pressure is 185/115. When do we contact the flight surgeon?", "vital-sign-ranges"],
  ["A solar storm is starting. What is the radiation shelter procedure?", "space-radiation"],
  ["Where is the pulse oximeter in the medical kit?", "med-kit-inventory"],
  ["What is the commander's resting heart rate baseline?", "crew-baselines"],
  ["The ground link is down. How do we handle a medical event during the blackout?", "ground-link-blackout"],
];
/** Questions the ISS research (library v2) answers, and the document that must answer each. */
const MORE_EXAMPLES: [question: string, docId: string][] = [
  ["Who guides the crew medical officer?", "iss-medical-operations"],
  ["What imaging is available on the ISS?", "iss-medical-operations"],
  ["Which pack holds the pulse oximeter?", "med-kit-inventory"],
];
/** The library must not answer this one (no treatment advice in v1). */
const NO_ANSWER = "What is the best treatment for a kidney stone?";
/** Acceptable answers for the blood pressure question: the ranges or the hypertensive crisis checklist. */
const ALSO_OK: Record<string, string[]> = { "vital-sign-ranges": ["alarm-response"] };

/** Phrases tests/wording.test.ts bans, plus the other rules of the spec. */
const FORBIDDEN_WORDING = [
  /not a medical device/i,
  /decision[\s-]+support/i,
  /AI[\s-]+powered/i,
  /\bdetects?\b/i,
  /\bdiagnoses\b/i,
  /\binternet\b/i,
  /\bthe (first|only)\b/i,
];
/** A dose or an amount of a medicine (mg/dL is a lab unit, not a dose). */
const DOSE = /\b\d+(\.\d+)?\s?(mg|mcg|µg|ml|mL|IU|units?)\b(?!\/dL)/;
/** Other ways to write a dose, an amount or a schedule, in English and German. */
const DOSE_PATTERNS = [
  DOSE,
  /\b\d+([.,]\d+)?\s?(milligrams?|micrograms?|grams?|millilit(re|er)s?|Milligramm|Mikrogramm|Gramm|Milliliter)\b/i,
  /\b\d+([.,]\d+)?\s?(g|mmol)\b(?!\/)/,
  /\bevery\s+\d+\s*(hours?|h)\b/i,
  /\b(once|twice|three times|four times)\s+(a|per)\s+day\b/i,
  /\b(twice|three times|four times)\s+daily\b/i,
  /\b\d+\s*(x|times)\s*(daily|a day|per day)\b/i,
  /\b(\d+|one|two|three|four|half an?|ein|eine|zwei|drei|vier)\s+(tablets?|pills?|capsules?|Tabletten?|Kapseln?)\b/i,
  /\bper dose\b/i,
  /\balle\s+\d+\s+Stunden\b/i,
  /\b(einmal|zweimal|dreimal|viermal)\s+(täglich|am Tag|pro Tag)\b/i,
];
const DRUG_NAMES =
  /aspirin|acetylsalicyl|ibuprofen|paracetamol|acetaminophen|naproxen|diclofenac|ketorolac|tramadol|fentanyl|codeine|oxycodone|ketamine|midazolam|diazepam|lorazepam|haloperidol|diphenhydramine|loratadine|cetirizine|pseudoephedrine|omeprazole|loperamide|ciprofloxacin|amoxicillin|azithromycin|doxycycline|metronidazole|ceftriaxone|prednisone|hydrocortisone|glucagon|salbutamol|albuterol|furosemide|metoprolol|nifedipine|labetalol|clopidogrel|ticagrelor|alteplase|enoxaparin|sertraline|temazepam|bisphosph|melatonin|epinephrine|adrenaline|amiodarone|atropine|nitroglycerin|morphine|lidocaine|heparin|naloxone|dexamethasone|ondansetron|promethazine|scopolamine|zolpidem|modafinil|Schmerzmittel|painkiller/i;
/**
 * The medicine packs the ISS research names (docs/research/iss-health-equipment.md):
 * they exist, but the library leaves them and their contents out.
 */
const MEDICINE_PACKS = /convenience medications|oral medications|topical and injectable medications|medication pack/i;
/** The note every inventory item carries (lead decision: library v2). */
const KIT_NOTE = "Representative training inventory; pack names from public NASA sources (2011/2015), contents not confirmed for 2026.";
/** The CHeCS pack names of the inventory, without the medicine packs. */
const PACKS = [
  "Medical Diagnostics Pack",
  "Minor Treatment Pack",
  "Medical Supply Pack",
  "IV Supply Pack",
  "Physician Equipment Pack",
  "Emergency Medical Treatment Pack",
  "Advanced Life Support Pack",
  "Respiratory Support Pack",
  "Crew Medical Restraint System",
  "LIFEPAK 1000",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Straight quotes, so the drill text compares whatever quote style it uses. */
function plain(s: string) {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function doc(body: string, over: Partial<LibraryDoc> = {}): LibraryDoc {
  return { id: "t", title: "Test doc", category: "reference", source: "test", license: "MIT", path: "t.md", body, version: sha256(body), ...over };
}

const FRONT = `---
id: sample-doc
title: "Sample: doc"
category: protocol
source: Demify project text
license: Project text, MIT
reviewed: Project text, not clinically reviewed
updated: 2026-11-14
---
`;

/* ------------------------------------------------------------------------- */

describe("sha256", () => {
  it("is the hex SHA-256 of the UTF-8 text", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("SpO₂ ≤ 90 %")).toBe(createHash("sha256").update(Buffer.from("SpO₂ ≤ 90 %", "utf8")).digest("hex"));
    expect(sha256("a")).not.toBe(sha256("a "));
  });
});

describe("parseDoc", () => {
  it("reads the front matter and versions the body", () => {
    const d = parseDoc("protocols/sample.md", `${FRONT}\n# Sample\n\nBody text.\n\n`);
    expect(d).toMatchObject({
      id: "sample-doc",
      title: "Sample: doc",
      category: "protocol",
      source: "Demify project text",
      license: "Project text, MIT",
      reviewed: "Project text, not clinically reviewed",
      updated: "2026-11-14",
      path: "protocols/sample.md",
      body: "# Sample\n\nBody text.",
    });
    expect(d.url).toBeUndefined();
    expect(d.version).toBe(sha256(d.body));
  });

  it("is independent of line endings and keeps the url", () => {
    const raw = `${FRONT.replace("license:", "url: https://example.org/x\nlicense:")}# Sample\n\nBody text.\n`;
    const lf = parseDoc("a.md", raw);
    const crlf = parseDoc("a.md", raw.replace(/\n/g, "\r\n"));
    expect(crlf.version).toBe(lf.version);
    expect(lf.url).toBe("https://example.org/x");
  });

  it.each([
    ["no front matter", "# Title\n\nText", /missing front matter/],
    ["an unclosed block", "---\nid: x\ntitle: X\n", /not closed/],
    ["a line that is not key: value", FRONT.replace("source:", "just text\nsource:") + "Body", /not "key: value"/],
    ["an unknown category", FRONT.replace("category: protocol", "category: medicine") + "Body", /unknown category "medicine"/],
    ["a malformed id", FRONT.replace("id: sample-doc", "id: Sample Doc") + "Body", /id "Sample Doc"/],
    ["a malformed date", FRONT.replace("updated: 2026-11-14", "updated: 14.11.2026") + "Body", /not a YYYY-MM-DD date/],
    ["an empty body", FRONT + "\n\n", /has no body/],
  ])("throws on %s, naming the file", (_label, raw, message) => {
    expect(() => parseDoc("protocols/broken.md", raw)).toThrow(message);
    expect(() => parseDoc("protocols/broken.md", raw)).toThrow(/protocols\/broken\.md/);
  });

  it.each(["id", "title", "category", "source", "license"])("throws when %s is missing", (key) => {
    const raw = FRONT.split("\n")
      .filter((l) => !l.startsWith(`${key}:`))
      .join("\n");
    expect(() => parseDoc("x.md", `${raw}Body`)).toThrow(`front matter is missing "${key}"`);
  });
});

describe("chunkDoc", () => {
  it("splits at headings and keeps the heading path", () => {
    const d = doc(
      [
        "Intro text.",
        "# Main",
        "Main text.",
        "## Part A",
        "Alpha text.",
        "### Detail",
        "Detail text.",
        "## Part B",
        "Beta text.",
        "```",
        "# not a heading inside a code fence",
        "```",
        "## Empty",
        "## Part C",
        "Gamma text.",
      ].join("\n\n"),
    );
    const chunks = chunkDoc(d);
    expect(chunks.map((c) => [c.heading, c.text])).toEqual([
      ["Test doc", "Intro text."],
      ["Main", "Main text."],
      ["Main › Part A", "Alpha text."],
      ["Main › Part A › Detail", "Detail text."],
      ["Main › Part B", "Beta text.\n\n```\n\n# not a heading inside a code fence\n\n```"],
      ["Main › Part C", "Gamma text."],
    ]);
    expect(chunks.map((c) => c.ord)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const c of chunks) {
      expect(c.docId).toBe("t");
      expect(c.sha256).toBe(sha256(c.text));
    }
  });

  // 400 distinct words of varying length, in paragraphs of 40.
  const words = Array.from({ length: 400 }, (_, i) => `w${i}${"x".repeat(i % 7)}`);
  const longText = Array.from({ length: 10 }, (_, p) => words.slice(p * 40, p * 40 + 40).join(" ")).join("\n\n");
  const long = doc(`## Long section\n\n${longText}`);

  it("keeps every chunk within maxChars and never cuts a word", () => {
    for (const [maxChars, overlap] of [
      [1200, 150],
      [300, 60],
      [100, 20],
    ]) {
      const chunks = chunkDoc(long, { maxChars, overlap });
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.text.length).toBeLessThanOrEqual(maxChars);
        expect(c.heading).toBe("Long section");
        const at = longText.indexOf(c.text);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at === 0 || /\s/.test(longText[at - 1])).toBe(true);
        const end = at + c.text.length;
        expect(end === longText.length || /\s/.test(longText[end])).toBe(true);
      }
      // Together the chunks cover every word.
      const seen = new Set(chunks.flatMap((c) => c.text.split(/\s+/)));
      expect(words.every((w) => seen.has(w))).toBe(true);
    }
  });

  it("overlaps neighbouring chunks by at most the overlap", () => {
    const chunks = chunkDoc(long, { maxChars: 300, overlap: 60 });
    let overlapped = 0;
    for (let i = 1; i < chunks.length; i++) {
      const prevAt = longText.indexOf(chunks[i - 1].text);
      const at = longText.indexOf(chunks[i].text);
      const shared = prevAt + chunks[i - 1].text.length - at;
      expect(at).toBeGreaterThan(prevAt);
      expect(shared).toBeLessThanOrEqual(60);
      if (shared > 0) overlapped++;
    }
    expect(overlapped).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(chunkDoc(long)).toEqual(chunkDoc(long));
    expect(chunkDoc(long, { maxChars: 300, overlap: 60 })).toEqual(chunkDoc({ ...long }, { maxChars: 300, overlap: 60 }));
  });
});

/* ------------------------------------------------------------------------- */

const { docs, inventory } = await readLibraryDir(LIBRARY);

describe("the curated library (library/**)", () => {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const generated = [inventoryDoc(inventory, "2026-11-14"), crewBaselineDoc(CREW, "2026-11-14")];
  const markdownFiles = walk(LIBRARY).filter((f) => f.endsWith(".md"));

  it("reads every document (sorted, README.md at the root excluded)", async () => {
    expect(docs.map((d) => d.id).sort()).toEqual(
      [
        "alarm-response",
        "cabin-environment",
        "escalation-and-signal-delay",
        "ground-link-blackout",
        "iss-medical-operations",
        "space-radiation",
        "spaceflight-physiology",
        "vital-sign-ranges",
      ].sort(),
    );
    expect(docs.map((d) => d.path)).toEqual([...docs.map((d) => d.path)].sort());
    expect(docs.some((d) => /readme/i.test(d.path))).toBe(false);
    expect(await readLibraryDir(LIBRARY)).toEqual({ docs, inventory });
  });

  it("gives every document valid front matter", () => {
    for (const d of docs) {
      expect(["protocol", "reference", "baseline", "inventory", "drug-reference"]).toContain(d.category);
      expect(d.category, `${d.id}: baseline and inventory documents are generated`).toMatch(/^(protocol|reference)$/);
      expect(d.reviewed, d.id).toBe("Project text, not clinically reviewed");
      expect(d.updated, d.id).toBe("2026-11-14");
      expect(d.license, d.id).toMatch(/^Project text, MIT/);
      expect(d.source.length, d.id).toBeGreaterThan(10);
      if (d.url) expect(d.url).toMatch(/^https:\/\//);
      expect(d.version).toBe(sha256(d.body));
    }
    // The drug-reference category exists but stays empty in v1.
    expect(docs.filter((d) => d.category === "drug-reference")).toEqual([]);
  });

  it("follows the wording rules and names no drug, dose, amount, schedule or medicine pack", () => {
    const texts: [string, string][] = [
      ...markdownFiles.map((f): [string, string] => [path.relative(ROOT, f), readFileSync(f, "utf8")]),
      ["library/inventory/med-kit.json", readFileSync(path.join(LIBRARY, "inventory/med-kit.json"), "utf8")],
      ...generated.map((d): [string, string] => [`(generated) ${d.id}`, d.body]),
      ...generated.map((d): [string, string] => [`(generated) ${d.id} source`, d.source]),
    ];
    const hits: string[] = [];
    for (const [file, text] of texts) {
      text.split("\n").forEach((line, i) => {
        for (const re of [...FORBIDDEN_WORDING, ...DOSE_PATTERNS, DRUG_NAMES, MEDICINE_PACKS]) {
          if (re.test(line)) hits.push(`${file}:${i + 1}: ${re} in ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it("the dose and medicine patterns catch what they must (so the check above means something)", () => {
    for (const bad of [
      "Give 325 milligrams of the tablet now.",
      "Take 1 g every 6 hours.",
      "Take two tablets twice daily.",
      "Use 0.5 g per dose.",
      "Nehmen Sie 400 Milligramm Ibuprofen.",
      "Zwei Tabletten dreimal täglich.",
      "Give 5 mg now.",
    ]) {
      expect([...DOSE_PATTERNS, DRUG_NAMES].some((re) => re.test(bad)), bad).toBe(true);
    }
    expect(MEDICINE_PACKS.test("Oral Medications pack")).toBe(true);
    for (const ok of ["Blood glucose 70–99 mg/dL", "8.5 h sleep period", "every hour until you reach the daily target", "about 15 minutes"]) {
      expect([...DOSE_PATTERNS, DRUG_NAMES].some((re) => re.test(ok)), ok).toBe(false);
    }
  });

  it("restates the ISS research: confirmed facts with their source URLs, Crew-11 only as published", () => {
    const iss = byId.get("iss-medical-operations")!;
    expect(iss).toMatchObject({ category: "reference", path: "reference/iss-medical-operations.md" });
    const research = readFileSync(path.join(ROOT, "docs/research/iss-health-equipment.md"), "utf8");
    // Every source the document cites is one the research lists.
    const urls = [...iss.body.matchAll(/https:\/\/[^\s)]+/g)].map((m) => m[0]);
    expect(urls.length).toBeGreaterThanOrEqual(10);
    for (const url of urls) expect(research, url).toContain(url);
    expect(research).toContain(iss.url!);
    // Every section (passage) names its sources.
    const sections = chunkDoc(iss).filter((c) => c.heading !== iss.title);
    const headings = [...new Set(sections.map((c) => c.heading))];
    for (const h of headings) {
      expect(sections.filter((c) => c.heading === h).some((c) => /Sources: .*https:\/\//.test(c.text)), h).toBe(true);
    }
    for (const topic of [
      /Crew Medical Officers \(CMOs\)/,
      /flight surgeons on the ground guide/,
      /Biomedical engineers \(BMEs\)/,
      /Private Medical Conference \(PMC\)/,
      /step-by-step medical procedures, often with a flight surgeon on the line/,
      /Crew Medical Restraint System \(CMRS\)/,
      /Ultrasound guided from the ground/,
      /What the station cannot do/,
      /Crew-11/,
    ]) {
      expect(iss.body).toMatch(topic);
    }
    // Honest positioning and privacy.
    expect(iss.body).toContain("Demify is not connected to any ISS system, device or data link");
    expect(iss.body).toContain("The medical condition is private; this library does not describe it.");
    expect(iss.body).not.toMatch(/fincke|\b1st\b|\bfirst\b/i);
    // Unconfirmed items are not stated as facts.
    expect(iss.body).toContain("public sources do not confirm that it is still the AED in 2026");
    expect(iss.body).not.toMatch(/WinSCAT|KUDUwave|HP ZBook/);
  });

  it("keeps every chunk small enough to cite", () => {
    for (const d of [...docs, ...generated]) {
      const chunks = chunkDoc(d);
      expect(chunks.length, d.id).toBeGreaterThan(0);
      for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1200);
      expect(chunks).toEqual(chunkDoc(d));
    }
  });

  it("restates the vital-sign ranges and escalation rules of knowledge.ts word for word", () => {
    const body = byId.get("vital-sign-ranges")!.body;
    for (const def of Object.values(INDICATORS)) {
      expect(body, def.id).toContain(`- Nominal: ${def.ranges.nominal}`);
      expect(body, def.id).toContain(`- Caution: ${def.ranges.caution}`);
      expect(body, def.id).toContain(`- Critical: ${def.ranges.critical}`);
      expect(body, def.id).toContain(`- Contact the flight surgeon when: ${def.escalation}`);
      for (const s of def.sources) expect(body, def.id).toContain(s.url);
    }
  });

  it("restates the drill checklists of the crew page word for word", () => {
    const body = plain(byId.get("alarm-response")!.body);
    for (const id of ["stemi", "vf", "hypertensive-crisis"] as const) {
      const protocol = buildProtocol(id, { commDelaySeconds: 0.5, missionName: "ISS" });
      expect(body).toContain(`"${protocol.title}"`);
      for (const step of protocol.steps) {
        expect(body, `${id}/${step.id}`).toContain(plain(step.text));
        if (step.detail && step.id !== "surgeon") expect(body, `${id}/${step.id}`).toContain(plain(step.detail));
      }
    }
    const blackout = buildProtocol("vf", { commDelaySeconds: null, missionName: "Conjunction" }).steps.find((s) => s.id === "surgeon")!;
    expect(body).toContain(blackout.text);
    expect(body).toContain("Act on the onboard procedures; transmit when contact returns.");
    expect(body).toContain("Do not wait for an answer before acting; follow the onboard checklist and send updates.");
  });

  it("lists a representative training inventory of devices and supplies, by CHeCS pack", () => {
    expect(inventory.length).toBeGreaterThanOrEqual(20);
    expect(inventory.length).toBeLessThanOrEqual(35);
    expect(new Set(inventory.map((i) => i.id)).size).toBe(inventory.length);
    for (const item of inventory) {
      expect(item.notes!.startsWith(KIT_NOTE), item.id).toBe(true);
      // Stowed in its pack (medical kit), with the emergency equipment, or in the radiation kit.
      if (/^Environmental Health System/.test(item.category)) expect(item.location, item.id).toMatch(/^Environmental Health System radiation kit/);
      else if (/AED|Crew Medical Restraint System/.test(item.category)) expect(item.location!.startsWith(`Emergency equipment, ${item.category}, `), item.id).toBe(true);
      else expect(item.location!.startsWith(`Medical kit, ${item.category}, `), item.id).toBe(true);
      expect(item.quantity, item.id).toBeGreaterThan(0);
      expect(item.name).not.toMatch(DRUG_NAMES);
      expect(`${item.name} ${item.category} ${item.location} ${item.notes}`).not.toMatch(MEDICINE_PACKS);
    }
    // Every pack of the lead decision appears, and nothing else but the radiation kit.
    const categories = new Set(inventory.map((i) => i.category));
    for (const pack of PACKS) expect([...categories].some((c) => c.includes(pack)), pack).toBe(true);
    expect([...categories].every((c) => PACKS.some((p) => c.includes(p)) || /^Environmental Health System/.test(c))).toBe(true);
    expect([...categories].some((c) => /medication|medicine/i.test(c))).toBe(false);
    expect(inventory.filter((i) => i.expiresOn).length).toBeGreaterThanOrEqual(3);
    const names = inventory.map((i) => i.name).join("\n");
    for (const re of [
      /pulse oximeter/i,
      /blood pressure cuff/i,
      /thermometer/i,
      /ECG electrodes/i,
      /\bAED\b/,
      /bag-valve mask/i,
      /oxygen mask/i,
      /airway adjuncts/i,
      /IV start kit/i,
      /wound/i,
      /splint/i,
      /eye wash/i,
      /gloves/i,
      /dosimeter/i,
    ]) {
      expect(names).toMatch(re);
    }
    expect(inventory.find((i) => i.id === "pulse-oximeter")).toMatchObject({
      category: "Medical Diagnostics Pack (MDP)",
      location: "Medical kit, Medical Diagnostics Pack (MDP), pouch 2",
    });
    const file = JSON.parse(readFileSync(path.join(LIBRARY, "inventory/med-kit.json"), "utf8")) as { notice: string };
    expect(file.notice).toMatch(/^Representative training inventory, not the real ISS kit\./);
    expect(file.notice).toMatch(/medicine packs are left out/);
  });

  it("generates deterministic baseline and inventory documents", () => {
    const crew = crewBaselineDoc(CREW, "2026-11-14");
    expect(crew).toMatchObject({
      id: "crew-baselines",
      category: "baseline",
      reviewed: "Project text, not clinically reviewed",
      source: "Demify crew records (SIMULATED crew profiles, pre-flight baselines)",
    });
    expect(crew.body).toContain("Commander baseline, resting heart rate: 62 bpm");
    expect(crew.body).toContain("The crew profiles are SIMULATED");
    expect(crew.version).toBe(sha256(crew.body));
    // Same data in another order, another date: same version (nothing is re-embedded).
    expect(crewBaselineDoc([...CREW].reverse(), "2027-01-01").version).toBe(crew.version);
    expect(crewBaselineDoc(CREW.map((c) => (c.id === "cdr" ? { ...c, baseline: { ...c.baseline, heartRate: 64 } } : c)), "2026-11-14").version).not.toBe(crew.version);

    const inv = inventoryDoc(inventory, "2026-11-14");
    expect(inv).toMatchObject({ id: "med-kit-inventory", category: "inventory", updated: "2026-11-14" });
    expect(inv.body).toContain("## Medical Diagnostics Pack (MDP)");
    expect(inv.body).toContain("- Pulse oximeter, fingertip: stowed in Medical kit, Medical Diagnostics Pack (MDP), pouch 2; quantity 2; item id pulse-oximeter.");
    expect(inv.body).toMatch(/not the real ISS kit/);
    expect(inv.body).toMatch(/public NASA sources \(2011\/2015\).*; the contents of each pack are not confirmed for 2026/);
    // The note every item carries is said once, not on every line; item-specific notes stay.
    expect(inv.body).not.toContain(KIT_NOTE);
    expect(inv.body).toContain("IV bags cannot drip by gravity on the station");
    // The first inventory's note is dropped too, so an older ground copy reads the same.
    const v1 = inventoryDoc([{ ...inventory[0], notes: "Representative training inventory, not the real ISS kit. Backup cuff." }], "");
    expect(v1.body).toMatch(/; backup cuff; item id/);
    expect(inventoryDoc([...inventory].reverse(), "").version).toBe(inv.version);
  });

  describe("bundled keyword search", () => {
    const all = [...docs, ...generated];

    it.each([...EXAMPLES, ...MORE_EXAMPLES])("answers %j from %s", (question, expected) => {
      const r = searchBundled(all, question, 5);
      expect(r.tier).toBe("bundled");
      expect(r.integrityFailures).toBe(0);
      expect([expected, ...(ALSO_OK[expected] ?? [])]).toContain(r.hits[0]?.docId);
      expect(r.hits.slice(0, 3).map((h) => h.docId)).toContain(expected);
      const top = r.hits[0];
      expect(top).toMatchObject({ tier: "bundled", integrityOk: true, reviewed: "Project text, not clinically reviewed" });
      expect(top.sha256).toBe(sha256(top.text));
      expect(top.heading).toBeTruthy();
      expect(top.version).toBe(all.find((d) => d.id === top.docId)!.version);
    });

    it("scores in 0..1, sorted, deterministic, at most k", () => {
      for (const [q] of [...EXAMPLES, ...MORE_EXAMPLES]) {
        const r = searchBundled(all, q, 4);
        expect(r.hits.length).toBeLessThanOrEqual(4);
        expect(r.hits.every((h) => h.score > 0 && h.score <= 1)).toBe(true);
        expect(r.hits.map((h) => h.score)).toEqual([...r.hits.map((h) => h.score)].sort((a, b) => b - a));
        expect(searchBundled(all, q, 4)).toEqual(r);
      }
    });

    it("scores the question the library cannot answer below every example question", () => {
      const weak = searchBundled(all, NO_ANSWER, 5).hits[0]?.score ?? 0;
      for (const [q] of [...EXAMPLES, ...MORE_EXAMPLES]) expect(searchBundled(all, q, 1).hits[0].score).toBeGreaterThan(weak);
    });

    it("finds nothing for a question without searchable words", () => {
      const r = searchBundled(all, "What is it?", 5);
      expect(r.hits).toEqual([]);
      expect(r.fallbackReason).toMatch(/no searchable words/);
    });

    it("drops a document whose body no longer matches its version", () => {
      const tampered = all.map((d) => (d.id === "space-radiation" ? { ...d, body: `${d.body}\n\nTampered.` } : d));
      const r = searchBundled(tampered, EXAMPLES[2][0], 5);
      expect(r.integrityFailures).toBe(1);
      expect(r.hits.some((h) => h.docId === "space-radiation")).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------------- */
/* PostgreSQL: DEMIFY_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/demify_b2 npx vitest run tests/library.test.ts */
/* ------------------------------------------------------------------------- */

/** Deterministic bag-of-words embedding (768-d), standing in for the model. */
function fakeVector(text: string): number[] {
  const v = new Array<number>(768).fill(0);
  const stop = new Set("a an and are as at be by do does for from how in is it of on or the to we what when where with".split(" "));
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (stop.has(w)) continue;
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    v[(h >>> 0) % 768] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

describe.skipIf(!TEST_DB)("PostgreSQL sync and retrieval", () => {
  let pool: Pool;
  let ground: string;
  /** Documents after a sync: the ground documents plus the generated inventory and crew baselines. */
  const DOCS = docs.length + 2;
  const cfgOf = (env: Record<string, string> = {}) =>
    onboardConfig({ DATABASE_URL: DB_URL, DEMIFY_GROUND_LIBRARY_DIR: ground, ...env });
  const counts = async () => {
    const { rows } = await pool.query(
      "SELECT (SELECT count(*) FROM library_documents)::int AS docs, (SELECT count(*) FROM library_chunks)::int AS chunks, (SELECT count(*) FROM med_kit_items)::int AS items",
    );
    return rows[0] as { docs: number; chunks: number; items: number };
  };
  const lastRun = async () => (await pool.query("SELECT * FROM sync_runs WHERE kind = 'library' ORDER BY id DESC LIMIT 1")).rows[0];

  beforeAll(async () => {
    // A clean schema of our own; pgvector stays in public, shared with the other tests.
    const admin = new pg.Client({ connectionString: TEST_DB });
    await admin.connect();
    try {
      await admin.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public").catch(() => {});
      await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    } finally {
      await admin.end();
    }
    process.env.DATABASE_URL = DB_URL;
    await closePool();
    pool = getPool();
    await ensureSchema(pool);
    expect((await pool.query("SELECT to_regclass('library_chunks')::text AS t")).rows[0].t).toBe("library_chunks");
    expect((await pool.query(`SELECT to_regclass('${SCHEMA}.library_chunks')::text AS t`)).rows[0].t).not.toBeNull();
    await pool.query(
      "INSERT INTO crew (id, name, role, baseline, updated_at) SELECT x.id, x.name, x.role, x.baseline, '2026-11-01T00:00:00Z' FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, role text, baseline jsonb)",
      [JSON.stringify(CREW)],
    );
    ground = mkdtempSync(path.join(tmpdir(), "demify-ground-"));
    cpSync(LIBRARY, ground, { recursive: true });
  });

  afterAll(async () => {
    await closePool();
    delete process.env.DATABASE_URL;
    if (ground) rmSync(ground, { recursive: true, force: true });
  });

  beforeEach(() => {
    model.embed.mockReset();
    model.modelStatus.mockReset();
    model.modelStatus.mockResolvedValue({ reachable: true, available: ["nomic-embed-text"], llmReady: false, embedReady: true });
    model.embed.mockImplementation(async (_cfg: unknown, texts: string[]) => texts.map(fakeVector));
  });

  it("first sync adds every document, the generated ones and the inventory", async () => {
    expect(await lastLibrarySync(pool)).toBeNull();
    const r = await syncLibrary(pool, cfgOf(), { trigger: "cli", groundLinkUp: true });
    expect(r).toMatchObject({ kind: "library", status: "ok", trigger: "cli", docsAdded: DOCS, docsUpdated: 0, docsRemoved: 0, docsUnchanged: 0, inventoryItems: inventory.length, chunksEmbedded: 0 });
    const c = await counts();
    expect(c).toMatchObject({ docs: DOCS, items: inventory.length });
    expect(r.chunksPendingEmbedding).toBe(c.chunks);
    const { rows } = await pool.query("SELECT id, category, body_sha256, updated FROM library_documents ORDER BY id");
    expect(rows.find((d) => d.id === "crew-baselines")).toMatchObject({ category: "baseline", updated: "2026-11-01" });
    expect((await pool.query("SELECT source FROM library_documents WHERE id = 'crew-baselines'")).rows[0].source).toBe(
      "Demify crew records (SIMULATED crew profiles, pre-flight baselines)",
    );
    expect(await crewBaselinesState(pool)).toMatchObject({ crewMembers: 4, due: false });
    expect(rows.find((d) => d.id === "med-kit-inventory")).toMatchObject({ category: "inventory", updated: "2026-11-14" });
    const run = await lastRun();
    expect(run).toMatchObject({ status: "ok", trigger: "cli" });
    expect(run.detail).toMatchObject({ docsAdded: DOCS, inventoryItems: inventory.length });
    expect(await lastLibrarySync(pool)).toBe(new Date(run.finished_at).toISOString());
    // Chunks match chunkDoc exactly.
    const radiation = (await readLibraryDir(ground)).docs.find((d) => d.id === "space-radiation")!;
    const stored = (await pool.query("SELECT ord, heading, text, sha256 FROM library_chunks WHERE doc_id = 'space-radiation' ORDER BY ord")).rows;
    expect(stored).toEqual(chunkDoc(radiation).map(({ ord, heading, text, sha256: s }) => ({ ord, heading, text, sha256: s })));
  });

  it("an unchanged library changes nothing", async () => {
    const before = (await pool.query("SELECT c.id, d.synced_at FROM library_chunks c JOIN library_documents d ON d.id = c.doc_id ORDER BY c.id")).rows;
    const r = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true });
    expect(r).toMatchObject({ status: "ok", docsAdded: 0, docsUpdated: 0, docsRemoved: 0, docsUnchanged: DOCS });
    const after = (await pool.query("SELECT c.id, d.synced_at FROM library_chunks c JOIN library_documents d ON d.id = c.doc_id ORDER BY c.id")).rows;
    expect(after).toEqual(before);
  });

  it("adds, updates and removes documents; generated documents stay", async () => {
    writeFileSync(
      path.join(ground, "protocols/test-added.md"),
      `${FRONT.replace("id: sample-doc", "id: test-added")}\n# Added\n\n## Section\n\nA new procedure for the test.\n`,
    );
    const cabin = path.join(ground, "reference/cabin-environment.md");
    writeFileSync(cabin, `${readFileSync(cabin, "utf8")}\n## Test section\n\nAn added paragraph.\n`);
    unlinkSync(path.join(ground, "reference/spaceflight-physiology.md"));
    const syncedBefore = (await pool.query("SELECT synced_at FROM library_documents WHERE id = 'cabin-environment'")).rows[0].synced_at;

    const r = await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true });
    expect(r).toMatchObject({ status: "ok", docsAdded: 1, docsUpdated: 1, docsRemoved: 1, docsUnchanged: DOCS - 2 });
    const ids = (await pool.query("SELECT id FROM library_documents ORDER BY id")).rows.map((x) => x.id);
    expect(ids).toContain("test-added");
    expect(ids).not.toContain("spaceflight-physiology");
    expect(ids).toEqual(expect.arrayContaining(["crew-baselines", "med-kit-inventory"]));
    expect((await pool.query("SELECT count(*)::int AS n FROM library_chunks WHERE doc_id = 'spaceflight-physiology'")).rows[0].n).toBe(0);
    const cabinRow = (await pool.query("SELECT body_sha256, synced_at FROM library_documents WHERE id = 'cabin-environment'")).rows[0];
    expect(cabinRow.synced_at.getTime()).toBeGreaterThan(syncedBefore.getTime());
    const headings = (await pool.query("SELECT heading FROM library_chunks WHERE doc_id = 'cabin-environment'")).rows.map((x) => x.heading);
    expect(headings).toContain("Cabin environment and CO₂ › Test section");
  });

  it("skips while the ground link is down, unless forced", async () => {
    unlinkSync(path.join(ground, "protocols/test-added.md"));
    const groundSync = await lastLibrarySync(pool);
    expect(groundSync).not.toBeNull();
    const skipped = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: false });
    expect(skipped).toMatchObject({ status: "skipped", reason: "Ground link is down (blackout): nothing to sync from", docsRemoved: 0 });
    expect(await lastRun()).toMatchObject({ status: "skipped", trigger: "schedule" });
    expect((await pool.query("SELECT 1 FROM library_documents WHERE id = 'test-added'")).rowCount).toBe(1);

    const forced = await syncLibrary(pool, cfgOf(), { trigger: "startup", groundLinkUp: false, force: true });
    expect(forced).toMatchObject({ status: "ok", docsRemoved: 1 });
    expect((await pool.query("SELECT 1 FROM library_documents WHERE id = 'test-added'")).rowCount).toBe(0);
    // A startup seed is not a sync from the ground.
    expect(await lastLibrarySync(pool)).toBe(groundSync);
    expect(await librarySyncInfo(pool)).toEqual({ lastGroundSync: groundSync, seededAt: forced.finishedAt });
  });

  it("counts a forced CLI run as from the ground only when the ground link was up", async () => {
    const before = await librarySyncInfo(pool);
    const blackout = await syncLibrary(pool, cfgOf(), { trigger: "cli", groundLinkUp: false, force: true });
    expect(blackout.status).toBe("ok");
    expect(await librarySyncInfo(pool)).toEqual({ lastGroundSync: before.lastGroundSync, seededAt: blackout.finishedAt });
    expect(await lastLibrarySync(pool)).toBe(before.lastGroundSync);

    const up = await syncLibrary(pool, cfgOf(), { trigger: "cli", groundLinkUp: true, force: true });
    expect(await librarySyncInfo(pool)).toEqual({ lastGroundSync: up.finishedAt, seededAt: blackout.finishedAt });
    expect(await lastLibrarySync(pool)).toBe(up.finishedAt);
  });

  it("fails without changing anything when the ground folder has no Markdown documents", async () => {
    const before = await counts();
    const runsBefore = await librarySyncInfo(pool);
    const empty = mkdtempSync(path.join(tmpdir(), "demify-empty-ground-"));
    try {
      // Empty, and with only the inventory: both have no documents.
      for (const setup of [() => {}, () => cpSync(path.join(LIBRARY, "inventory"), path.join(empty, "inventory"), { recursive: true })]) {
        setup();
        for (const force of [false, true]) {
          const r = await syncLibrary(pool, cfgOf({ DEMIFY_GROUND_LIBRARY_DIR: empty }), { trigger: "schedule", groundLinkUp: true, force });
          expect(r.status).toBe("failed");
          expect(r.reason).toBe(`the ground library ${empty} has no Markdown documents (empty, or not mounted?); nothing was changed`);
          expect(r.docsRemoved).toBe(0);
          expect(await counts()).toEqual(before);
          expect(await lastRun()).toMatchObject({ status: "failed", detail: expect.objectContaining({ reason: r.reason }) });
        }
      }
      expect(await librarySyncInfo(pool)).toEqual(runsBefore);

      // library-ingest prints the reason and exits non-zero.
      const cli = spawnSync(process.execPath, [path.join(ROOT, "scripts/library-ingest.mjs"), "--dir", empty], {
        env: { ...process.env, DATABASE_URL: DB_URL, DEMIFY_OFFLINE: "", DEMIFY_MODEL_URL: "" },
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(cli.status, cli.stderr).toBe(1);
      expect(cli.stdout).toMatch(/Library sync \(cli\): failed/);
      expect(cli.stdout).toContain("has no Markdown documents");
      expect(cli.stderr).toMatch(/Library sync failed: the ground library .* has no Markdown documents/);
      expect(await counts()).toEqual(before);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("refuses to remove more than half of the documents unless forced", async () => {
    // Start from the full library (an earlier test removed a document from the ground folder).
    cpSync(LIBRARY, ground, { recursive: true });
    expect((await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true })).status).toBe("ok");
    const before = await counts();
    expect(before.docs).toBe(DOCS);
    const half = mkdtempSync(path.join(tmpdir(), "demify-half-ground-"));
    try {
      // A half-copied folder: 3 of the 8 ground documents arrived.
      cpSync(path.join(LIBRARY, "protocols"), path.join(half, "protocols"), { recursive: true });
      cpSync(path.join(LIBRARY, "inventory"), path.join(half, "inventory"), { recursive: true });
      const total = docs.length;
      const kept = readdirSync(path.join(half, "protocols")).length;
      const r = await syncLibrary(pool, cfgOf({ DEMIFY_GROUND_LIBRARY_DIR: half }), { trigger: "schedule", groundLinkUp: true });
      expect(r.status).toBe("failed");
      expect(r.reason).toContain(`would remove ${total - kept} of ${total} documents (more than half)`);
      expect(r.reason).toContain("--force");
      expect(await counts()).toEqual(before);

      // Exactly half is still allowed: add the cabin document so 4 of 8 go.
      mkdirSync(path.join(half, "reference"));
      cpSync(path.join(LIBRARY, "reference/cabin-environment.md"), path.join(half, "reference/cabin-environment.md"));
      const allowed = await syncLibrary(pool, cfgOf({ DEMIFY_GROUND_LIBRARY_DIR: half }), { trigger: "manual", groundLinkUp: true });
      expect(allowed).toMatchObject({ status: "ok", docsRemoved: total - kept - 1 });

      // Restore from the full ground folder, then remove the same documents again with force.
      expect((await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true })).status).toBe("ok");
      rmSync(path.join(half, "reference"), { recursive: true });
      const forced = await syncLibrary(pool, cfgOf({ DEMIFY_GROUND_LIBRARY_DIR: half }), { trigger: "cli", groundLinkUp: true, force: true });
      expect(forced).toMatchObject({ status: "ok", docsRemoved: total - kept });
    } finally {
      rmSync(half, { recursive: true, force: true });
    }
    // Back to the full library.
    expect((await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true })).status).toBe("ok");
    expect(await counts()).toEqual(before);
  });

  it("skips while another sync holds the lock", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [LOCK_SYNC]);
      const r = await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true });
      expect(r).toMatchObject({ status: "skipped", reason: "Another library sync is running" });
      expect(await lastRun()).toMatchObject({ status: "skipped", trigger: "manual" });
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [LOCK_SYNC]);
      holder.release();
    }
  });

  it("fails on a broken document without changing the library, and closes interrupted runs", async () => {
    await pool.query("INSERT INTO sync_runs (kind, trigger, status) VALUES ('library', 'schedule', 'running')");
    const before = await counts();
    const broken = path.join(ground, "protocols/broken.md");
    writeFileSync(broken, "---\ntitle: No id\ncategory: protocol\nsource: x\nlicense: x\n---\n\nBody\n");
    const r = await syncLibrary(pool, cfgOf(), { trigger: "manual", groundLinkUp: true });
    expect(r.status).toBe("failed");
    expect(r.reason).toMatch(/protocols\/broken\.md: front matter is missing "id"/);
    expect(await counts()).toEqual(before);
    expect(await lastRun()).toMatchObject({ status: "failed" });
    unlinkSync(broken);
    const interrupted = (await pool.query("SELECT status, detail FROM sync_runs WHERE kind = 'library' ORDER BY id")).rows;
    expect(interrupted.some((x) => x.status === "running")).toBe(false);
    expect(interrupted.some((x) => /interrupted/.test(x.detail.reason ?? ""))).toBe(true);
    expect(await lastLibrarySync(pool)).not.toBeNull();
  });

  it("falls back to full-text search without a model, with verified hits", async () => {
    // Restore the full library first.
    cpSync(LIBRARY, ground, { recursive: true });
    expect((await syncLibrary(pool, cfgOf(), { trigger: "cli", groundLinkUp: true })).status).toBe("ok");
    for (const [question, expected] of [...EXAMPLES, ...MORE_EXAMPLES]) {
      const r = await searchLibrary(pool, cfgOf(), question, 5);
      expect(r.tier).toBe("fulltext");
      expect(r.fallbackReason).toBe("no embedding model configured");
      expect(r.integrityFailures).toBe(0);
      expect(r.hits.slice(0, 3).map((h) => h.docId), question).toEqual(expect.arrayContaining([expect.toBeOneOf([expected, ...(ALSO_OK[expected] ?? [])])]));
      for (const h of r.hits) {
        expect(h).toMatchObject({ tier: "fulltext", integrityOk: true });
        expect(h.sha256).toBe(sha256(h.text));
        expect(h.score).toBeGreaterThan(0);
        expect(new Date(h.syncedAt!).toISOString()).toBe(h.syncedAt);
        expect(h.source.length).toBeGreaterThan(0);
      }
    }
    expect(model.embed).not.toHaveBeenCalled();
  });

  it("excludes a tampered chunk from search, and the next sync repairs it", async () => {
    const q = EXAMPLES[2][0];
    const target = (await searchLibrary(pool, cfgOf(), q, 5)).hits[0];
    expect(target.docId).toBe("space-radiation");
    await pool.query("UPDATE library_chunks SET text = text || ' Tampered.' WHERE doc_id = $1 AND sha256 = $2", [target.docId, target.sha256]);
    const r = await searchLibrary(pool, cfgOf(), q, 5);
    expect(r.integrityFailures).toBe(1);
    expect(r.hits.some((h) => h.sha256 === target.sha256 || /Tampered/.test(h.text))).toBe(false);

    const sync = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true });
    expect(sync).toMatchObject({ status: "ok", docsUpdated: 0, docsUnchanged: DOCS });
    expect((await lastRun()).detail.docsRepaired).toBe(1);
    const again = await searchLibrary(pool, cfgOf(), q, 5);
    expect(again.integrityFailures).toBe(0);
    expect(again.hits[0].sha256).toBe(target.sha256);
  });

  it("embeds pending chunks with the model and then searches by vector", async () => {
    const cfg = cfgOf({ DEMIFY_MODEL_URL: "http://model.test/v1" });
    const pending = (await counts()).chunks;
    const before = await searchLibrary(pool, cfg, EXAMPLES[3][0], 5);
    expect(before.tier).toBe("fulltext");
    expect(before.fallbackReason).toBe(`${pending} library chunks are still waiting for embeddings`);
    expect(model.embed).not.toHaveBeenCalled();

    expect(await embedPending(pool, cfg, 40)).toBe(40);
    expect(model.embed).toHaveBeenCalledTimes(2); // batches of 32
    const [cfgArg, texts, kind] = model.embed.mock.calls[0];
    expect(cfgArg).toBe(cfg);
    expect(kind).toBe("document");
    expect(texts).toHaveLength(32);
    const first = (await pool.query("SELECT heading, text FROM library_chunks ORDER BY id LIMIT 1")).rows[0];
    expect(texts[0]).toBe(`${first.heading}\n\n${first.text}`); // heading + text

    const r = await syncLibrary(pool, cfg, { trigger: "manual", groundLinkUp: true });
    expect(r).toMatchObject({ status: "ok", chunksEmbedded: pending - 40, chunksPendingEmbedding: 0 });
    expect(r.reason).toBeUndefined();
    expect((await pool.query("SELECT DISTINCT embed_model FROM library_chunks")).rows).toEqual([{ embed_model: "nomic-embed-text" }]);

    for (const [question, expected] of [...EXAMPLES, ...MORE_EXAMPLES]) {
      const v = await searchLibrary(pool, cfg, question, 5);
      expect(v.tier).toBe("vector");
      expect(v.fallbackReason).toBeUndefined();
      expect(v.hits.length).toBe(5);
      expect(v.hits.slice(0, 3).map((h) => h.docId), question).toContain(expected);
      for (const h of v.hits) expect(h.score).toBeGreaterThanOrEqual(0);
      expect(v.hits[0].score).toBeLessThanOrEqual(1);
    }
    // The question gets a short time limit of its own (default 3 s); the rest of the settings stay.
    expect(model.embed).toHaveBeenLastCalledWith({ ...cfg, embedTimeoutMs: 3000 }, [MORE_EXAMPLES[2][0]], "query");
    expect((await searchLibrary(pool, cfg, EXAMPLES[0][0], 5, { embedTimeoutMs: 1234 })).tier).toBe("vector");
    expect(model.embed).toHaveBeenLastCalledWith({ ...cfg, embedTimeoutMs: 1234 }, [EXAMPLES[0][0]], "query");

    // skipVector: straight to full-text, no embedding call.
    model.embed.mockClear();
    const skipped = await searchLibrary(pool, cfg, EXAMPLES[3][0], 5, { skipVector: true });
    expect(skipped).toMatchObject({ tier: "fulltext", fallbackReason: "vector search skipped (the model server was not ready at the last check)" });
    expect(skipped.hits[0].docId).toBe("med-kit-inventory");
    expect(model.embed).not.toHaveBeenCalled();

    // Another embedding model: its vectors are not comparable, so everything is pending again.
    const other = await searchLibrary(pool, cfgOf({ DEMIFY_MODEL_URL: "http://model.test/v1", DEMIFY_EMBED_MODEL: "other-embed" }), "pulse oximeter");
    expect(other.tier).toBe("fulltext");
    expect(other.fallbackReason).toMatch(/waiting for embeddings/);
  });

  it("falls back to full-text when the model cannot embed the question, and pauses vector search for 30 s", async () => {
    const cfg = cfgOf({ DEMIFY_MODEL_URL: "http://model.test/v1" });
    model.embed.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const r = await searchLibrary(pool, cfg, EXAMPLES[3][0], 5);
    expect(r.tier).toBe("fulltext");
    expect(r.fallbackReason).toBe("embedding model unreachable (connect ECONNREFUSED)");
    expect(r.hits[0].docId).toBe("med-kit-inventory");
    expect(model.embed).toHaveBeenCalledTimes(1);

    // The failure is remembered: no second wait on a broken model server.
    model.embed.mockImplementation(async (_cfg: unknown, texts: string[]) => texts.map(fakeVector));
    const paused = await searchLibrary(pool, cfg, EXAMPLES[2][0], 5);
    expect(paused.tier).toBe("fulltext");
    expect(paused.fallbackReason).toMatch(/^embedding model unreachable \(connect ECONNREFUSED\); vector search paused for (30|29) s$/);
    expect(paused.hits[0].docId).toBe("space-radiation");
    expect(model.embed).toHaveBeenCalledTimes(1);

    // About 30 s later the vector tier is tried again.
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
    try {
      expect((await searchLibrary(pool, cfg, EXAMPLES[2][0], 5)).tier).toBe("vector");
    } finally {
      clock.mockRestore();
    }
    expect(model.embed).toHaveBeenCalledTimes(2);
  });

  it("describes an HTTP error from the embeddings endpoint as a model error, not as unreachable", async () => {
    const cfg = cfgOf({ DEMIFY_MODEL_URL: "http://model-500.test/v1" });
    const err = Object.assign(new Error("embeddings (nomic-embed-text): HTTP 500: model runner crashed"), { kind: "http", status: 500 });
    model.embed.mockRejectedValue(err);
    const r = await searchLibrary(pool, cfg, EXAMPLES[3][0], 5);
    expect(r.tier).toBe("fulltext");
    expect(r.fallbackReason).toBe("embedding model error (embeddings (nomic-embed-text): HTTP 500: model runner crashed)");
    expect(r.fallbackReason).not.toMatch(/unreachable/);

    // A timeout says so, too (another model URL, so no pause is remembered yet).
    const slow = cfgOf({ DEMIFY_MODEL_URL: "http://model-slow.test/v1" });
    model.embed.mockRejectedValue(Object.assign(new Error("embeddings (nomic-embed-text): no answer within 3 s"), { kind: "timeout" }));
    expect((await searchLibrary(pool, slow, EXAMPLES[3][0], 5)).fallbackReason).toBe(
      "embedding model did not answer in time (embeddings (nomic-embed-text): no answer within 3 s)",
    );
  });

  it("keeps chunks pending when the model fails, and records it without failing the sync", async () => {
    const cfg = cfgOf({ DEMIFY_MODEL_URL: "http://model.test/v1" });
    const cabin = path.join(ground, "reference/cabin-environment.md");
    writeFileSync(cabin, `${readFileSync(cabin, "utf8")}\n## Another test section\n\nChanged again.\n`);
    model.embed.mockRejectedValue(new Error("HTTP 500 from the model server"));
    const r = await syncLibrary(pool, cfg, { trigger: "schedule", groundLinkUp: true });
    expect(r).toMatchObject({ status: "ok", docsUpdated: 1, chunksEmbedded: 0 });
    expect(r.chunksPendingEmbedding).toBeGreaterThan(0);
    expect(r.reason).toMatch(/wait for embeddings .*HTTP 500 from the model server/);
    expect((await lastRun()).detail.embedError).toMatch(/HTTP 500/);
    expect((await searchLibrary(pool, cfg, "cabin CO2 limit")).tier).toBe("fulltext");

    // Model server down: no embedding attempt at all.
    model.embed.mockClear();
    model.modelStatus.mockResolvedValue({ reachable: false, available: [], llmReady: false, embedReady: false, error: "timeout" });
    const down = await syncLibrary(pool, cfg, { trigger: "schedule", groundLinkUp: true });
    expect(down).toMatchObject({ status: "ok", chunksEmbedded: 0, chunksPendingEmbedding: r.chunksPendingEmbedding });
    expect(down.reason).toMatch(/model server unreachable \(timeout\)/);
    expect(model.embed).not.toHaveBeenCalled();

    // Model back: the next sync embeds what was left.
    model.modelStatus.mockResolvedValue({ reachable: true, available: ["nomic-embed-text"], llmReady: false, embedReady: true });
    model.embed.mockImplementation(async (_cfg: unknown, texts: string[]) => texts.map(fakeVector));
    const back = await syncLibrary(pool, cfg, { trigger: "schedule", groundLinkUp: true });
    expect(back).toMatchObject({ status: "ok", docsUnchanged: DOCS, chunksEmbedded: r.chunksPendingEmbedding, chunksPendingEmbedding: 0 });
    expect((await searchLibrary(pool, cfg, "cabin CO2 limit")).tier).toBe("vector");
  });

  describe("crew baselines", () => {
    const crewDoc = async () =>
      (await pool.query("SELECT body, source, synced_at FROM library_documents WHERE id = 'crew-baselines'")).rows[0] as
        | { body: string; source: string; synced_at: Date }
        | undefined;
    const crewChunks = async () => (await pool.query("SELECT count(*)::int AS n FROM library_chunks WHERE doc_id = 'crew-baselines'")).rows[0].n as number;

    it("regenerates a missing document from the crew table, with the ground link up or down", async () => {
      expect(await crewBaselinesState(pool)).toMatchObject({ crewMembers: 4, due: false });
      await pool.query("DELETE FROM library_documents WHERE id = 'crew-baselines'");
      const state = await crewBaselinesState(pool);
      expect(state).toMatchObject({ crewMembers: 4, documentSyncedAt: null, due: true });
      expect(state.crewUpdatedAt).toBe("2026-11-01T00:00:00.000Z");

      // Onboard data: no ground link and no library sync needed.
      expect(await refreshCrewBaselines(pool)).toEqual({ status: "added", crewMembers: 4 });
      const doc = await crewDoc();
      expect(doc?.source).toBe("Demify crew records (SIMULATED crew profiles, pre-flight baselines)");
      expect(doc?.body).toContain("Commander baseline, resting heart rate: 62 bpm");
      expect(await crewChunks()).toBe(chunkDoc(crewBaselineDoc(CREW, "")).length);
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });
      expect(await refreshCrewBaselines(pool)).toEqual({ status: "unchanged", crewMembers: 4 });

      // A library sync also brings it back when it is missing.
      await pool.query("DELETE FROM library_documents WHERE id = 'crew-baselines'");
      const r = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true });
      expect(r).toMatchObject({ status: "ok", docsAdded: 1, docsUnchanged: DOCS - 1 });
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });
    });

    it("regenerates the document when a crew record is newer than it", async () => {
      // A changed baseline: new content.
      await pool.query("UPDATE crew SET baseline = baseline || '{\"heartRate\": 64}'::jsonb, updated_at = now() WHERE id = 'cdr'");
      expect(await crewBaselinesState(pool)).toMatchObject({ due: true });
      expect(await refreshCrewBaselines(pool)).toEqual({ status: "updated", crewMembers: 4 });
      expect((await crewDoc())?.body).toContain("Commander baseline, resting heart rate: 64 bpm");
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });

      // A newer record with the same content: nothing to rewrite, but the document counts as current again.
      await pool.query("UPDATE crew SET updated_at = now() WHERE id = 'plt'");
      expect(await crewBaselinesState(pool)).toMatchObject({ due: true });
      const before = (await pool.query("SELECT id FROM library_chunks WHERE doc_id = 'crew-baselines' ORDER BY id")).rows;
      expect(await refreshCrewBaselines(pool)).toEqual({ status: "unchanged", crewMembers: 4 });
      expect((await pool.query("SELECT id FROM library_chunks WHERE doc_id = 'crew-baselines' ORDER BY id")).rows).toEqual(before);
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });

      // The same through a library sync.
      await pool.query("UPDATE crew SET baseline = baseline || '{\"heartRate\": 62}'::jsonb, updated_at = now() WHERE id = 'cdr'");
      expect(await crewBaselinesState(pool)).toMatchObject({ due: true });
      expect(await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true })).toMatchObject({ status: "ok", docsUpdated: 1 });
      expect((await crewDoc())?.body).toContain("Commander baseline, resting heart rate: 62 bpm");
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });
      await pool.query("UPDATE crew SET updated_at = now() WHERE id = 'plt'");
      expect(await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true })).toMatchObject({ status: "ok", docsUnchanged: DOCS });
      expect(await crewBaselinesState(pool)).toMatchObject({ due: false });
    });

    it("waits for the crew, and steps aside while a library sync holds the lock", async () => {
      const crew = (await pool.query("SELECT id, name, role, baseline, updated_at FROM crew")).rows;
      await pool.query("DELETE FROM crew");
      try {
        expect(await crewBaselinesState(pool)).toMatchObject({ crewMembers: 0, crewUpdatedAt: null, due: false });
        expect(await refreshCrewBaselines(pool)).toEqual({ status: "no-crew" });
        const r = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true });
        expect(r.status).toBe("ok");
        expect((await lastRun()).detail.crew).toBe("crew table is empty; crew baselines not regenerated");
      } finally {
        await pool.query(
          "INSERT INTO crew (id, name, role, baseline, updated_at) SELECT x.id, x.name, x.role, x.baseline, x.updated_at FROM jsonb_to_recordset($1::jsonb) AS x(id text, name text, role text, baseline jsonb, updated_at timestamptz)",
          [JSON.stringify(crew)],
        );
      }
      const holder = await pool.connect();
      try {
        await holder.query("SELECT pg_advisory_lock($1)", [LOCK_SYNC]);
        expect(await refreshCrewBaselines(pool)).toEqual({ status: "skipped", reason: "Another library sync is running" });
      } finally {
        await holder.query("SELECT pg_advisory_unlock($1)", [LOCK_SYNC]);
        holder.release();
      }
    });
  });

  describe("sync history pruning", () => {
    const runCount = async (where = "true") => (await pool.query(`SELECT count(*)::int AS n FROM sync_runs WHERE ${where}`)).rows[0].n as number;

    it("keeps the last 30 days and at least the last 100 runs after every sync", async () => {
      // 150 old snapshot runs (40 days ago), as a long-running sync service would leave them.
      await pool.query(
        `INSERT INTO sync_runs (kind, trigger, status, started_at, finished_at, detail)
         SELECT 'snapshots', 'schedule', 'failed', now() - interval '40 days' - make_interval(mins => g), now() - interval '40 days' - make_interval(mins => g), '{}'::jsonb
           FROM generate_series(1, 150) AS g`,
      );
      const recent = await runCount("started_at >= now() - interval '30 days'");
      expect(recent).toBeLessThan(100);
      expect(await runCount("started_at < now() - interval '30 days'")).toBe(150);

      const r = await syncLibrary(pool, cfgOf(), { trigger: "schedule", groundLinkUp: true });
      expect(r.status).toBe("ok");
      // Everything from the last 30 days stays (plus this run), filled up to 100 rows with the newest old ones.
      expect(await runCount("started_at >= now() - interval '30 days'")).toBe(recent + 1);
      expect(await runCount()).toBe(100);
      const oldest = (await pool.query("SELECT min(started_at) AS t FROM sync_runs WHERE kind = 'snapshots' AND status = 'failed'")).rows[0].t as Date;
      expect(Date.now() - oldest.getTime()).toBeLessThan((40 * 24 * 60 + 151) * 60_000);
      // Nothing more to prune.
      expect(await pruneSyncRuns(pool)).toBe(0);
    });

    it("never prunes the latest successful run of each kind, so the last sync times stay", async () => {
      await pool.query(
        "INSERT INTO sync_runs (kind, trigger, status, started_at, finished_at, detail) VALUES ('snapshots', 'schedule', 'ok', now(), now(), '{}'::jsonb)",
      );
      const info = await librarySyncInfo(pool);
      expect(info.lastGroundSync).not.toBeNull();
      expect(info.seededAt).not.toBeNull();
      // Age everything by 60 days, then keep only the newest row.
      await pool.query("UPDATE sync_runs SET started_at = started_at - interval '60 days', finished_at = finished_at - interval '60 days'");
      const deleted = await pruneSyncRuns(pool, { keepRows: 1 });
      expect(deleted).toBeGreaterThan(0);
      const left = (await pool.query("SELECT kind, trigger, status, detail FROM sync_runs ORDER BY id")).rows;
      expect(left.length).toBeLessThanOrEqual(4);
      expect(left.some((x) => x.kind === "snapshots" && x.status === "ok")).toBe(true);
      const shifted = (iso: string | null) => (iso ? new Date(Date.parse(iso) - 60 * 24 * 3_600_000).toISOString() : null);
      expect(await librarySyncInfo(pool)).toEqual({ lastGroundSync: shifted(info.lastGroundSync), seededAt: shifted(info.seededAt) });
    });
  });
});
