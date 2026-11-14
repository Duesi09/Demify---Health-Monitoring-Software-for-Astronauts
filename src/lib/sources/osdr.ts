import "server-only";
import { config } from "../config";
import type { SourceResult } from "../types";
import { HttpStatusError, cached, fetchJson } from "./cache";

/**
 * NASA Open Science Data Repository (OSDR) adapter.
 *
 * Real, public astronaut data: the SpaceX Inspiration4 (I4) mission, the first
 * all-civilian orbital flight (3 days, 16-18 Sep 2021, 4 crew). Blood was drawn
 * 92, 44 and 3 days before launch (L-92/L-44/L-3) and 1, 45, 82 and 194 days
 * after return (R+1/R+45/R+82/R+194).
 *
 *   OSD-569  Complete Blood Count (CBC), clinical lab with reference ranges
 *   OSD-575  Comprehensive Metabolic Panel (CMP), clinical lab with ranges
 *   OSD-575  Eve Technologies cardiovascular/acute-phase multiplex (research)
 *   OSD-575  Eve Technologies 71-plex cytokine panel (research)
 *
 * OSDR serves files via a 302 to short-lived signed S3 URLs and does not send
 * CORS headers, so everything is fetched server-side. Files are static, so we
 * cache the PARSED content for a week and keep a compact offline snapshot.
 *
 * Public OSDR has NO real-time crew vitals (heart rate, blood pressure); these
 * blood panels are the closest real human dataset.
 */

const WEEK = 7 * 24 * 3600;
const HOUR = 3600;
/** Bump when the parsed shape changes so stale snapshots/caches are not misread. */
const SCHEMA = 2;

// ---------------------------------------------------------------- CSV parser

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** CSV rows -> objects keyed by trimmed header. */
export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** "12.3" -> 12.3; "", "N/A", "NA", "<0.1"-style junk -> null. */
export function num(v: string | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s || /^(n\/?a|nan|null|-|nd)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------- Inspiration4 data

export type Panel = "CBC" | "CMP" | "CARDIO" | "CYTOKINE";
export const PANELS: Panel[] = ["CBC", "CMP", "CARDIO", "CYTOKINE"];

export const TIMEPOINTS = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"] as const;
export type Timepoint = (typeof TIMEPOINTS)[number];
export const PRE_FLIGHT: Timepoint[] = ["L-92", "L-44", "L-3"];

export const I4_SUBJECTS = [
  { id: "C001", sex: "M" },
  { id: "C002", sex: "F" },
  { id: "C003", sex: "F" },
  { id: "C004", sex: "M" },
] as const;
export type SubjectId = (typeof I4_SUBJECTS)[number]["id"];

export const I4_MISSION = {
  name: "SpaceX Inspiration4",
  launch: "2021-09-16",
  splashdown: "2021-09-18",
  /** Launch to splashdown, days (2 d 23 h). */
  durationDays: 3,
  orbitKm: 585,
} as const;

/**
 * Day relative to LAUNCH. L-n -> -n. R+n counts from splashdown, so it maps to
 * durationDays + n. The flight itself is the window [0, durationDays].
 */
export function timepointDay(tp: string): number | null {
  const m = /^([LR])([+-])(\d+)$/.exec(tp.trim());
  if (!m) return null;
  const n = Number(m[3]) * (m[2] === "-" ? -1 : 1);
  return m[1] === "L" ? n : I4_MISSION.durationDays + n;
}

export interface StudyRef {
  accession: string;
  title: string;
  file: string;
  url: string;
}

const STUDY_TITLES: Record<string, string> = {
  "OSD-569": "Whole blood measurements from the SpaceX Inspiration4 mission",
  "OSD-575": "SpaceX Inspiration4 blood serum metabolic panel and immune/cardiac cytokine arrays",
  "OSD-656": "SpaceX Inspiration4 Urine Inflammation Panel (Multiplex, NULISAseq)",
};

export function studyUrl(accession: string) {
  return `${config.osdrBaseUrl}/bio/repo/data/studies/${accession}`;
}

interface PanelDef {
  panel: Panel;
  label: string;
  accession: string;
  file: string;
  kind: "clinical" | "multiplex";
  description: string;
}

export const PANEL_DEFS: Record<Panel, PanelDef> = {
  CBC: {
    panel: "CBC",
    label: "Complete blood count",
    accession: "OSD-569",
    file: "LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv",
    kind: "clinical",
    description: "Clinical lab (Quest) blood count with the lab's reference ranges.",
  },
  CMP: {
    panel: "CMP",
    label: "Metabolic panel",
    accession: "OSD-575",
    file: "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv",
    kind: "clinical",
    description: "Clinical lab comprehensive metabolic panel with the lab's reference ranges.",
  },
  CARDIO: {
    panel: "CARDIO",
    label: "Inflammation & cardiovascular",
    accession: "OSD-575",
    file: "LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv",
    kind: "multiplex",
    description:
      "Research multiplex immunoassay (Eve Technologies) of acute-phase and cardiovascular proteins. No clinical reference ranges: compare each person with their own pre-flight values.",
  },
  CYTOKINE: {
    panel: "CYTOKINE",
    label: "Cytokines",
    accession: "OSD-575",
    file: "LSDS-8_Multiplex_serum.immune.EvePanel_SUBMITTED.csv",
    kind: "multiplex",
    description:
      "Research 71-plex cytokine/chemokine immunoassay (Eve Technologies). No clinical reference ranges: compare each person with their own pre-flight values.",
  },
};

/** Reference interval as reported by the lab; either side may be open. */
export type RefRange = [number | null, number | null];

export interface I4Flag {
  subject: SubjectId;
  timepoint: Timepoint;
  /** "suspect" = implausible value (excluded from baselines); "range" = reference-range issue. */
  kind: "suspect" | "range";
  note: string;
}

/** One analyte; values are [subjectIndex][timepointIndex] (I4_SUBJECTS x TIMEPOINTS). */
export interface I4Analyte {
  id: string;
  name: string;
  /** Name exactly as in the OSDR file. */
  rawName: string;
  panel: Panel;
  unit: string;
  values: (number | null)[][];
  /** Most common reference interval for the analyte (clinical panels only). */
  ref: RefRange | null;
  /** Per-cell intervals, only present when the lab reported different ranges (e.g. female ranges). */
  refs?: (RefRange | null)[][];
  /** Data-quality notes on single values (shown, never hidden). */
  flags?: I4Flag[];
}

export interface I4PanelData {
  panel: Panel;
  label: string;
  kind: "clinical" | "multiplex";
  description: string;
  study: StudyRef;
  analytes: I4Analyte[];
}

/** Flat, self-describing row shape (what the API returns with ?format=rows). */
export interface I4Row {
  analyte: string;
  analyteId: string;
  panel: Panel;
  subject: SubjectId;
  sex: "M" | "F";
  timepoint: Timepoint;
  /** Days relative to launch (see timepointDay). */
  day: number;
  value: number | null;
  unit: string;
  refMin: number | null;
  refMax: number | null;
}

/** Friendly names for clinical analytes. Unknown names fall back to title case. */
const NAMES: Record<string, string> = {
  "WHITE BLOOD CELL COUNT": "White blood cells (WBC)",
  "RED BLOOD CELL COUNT": "Red blood cells (RBC)",
  HEMOGLOBIN: "Hemoglobin",
  HEMATOCRIT: "Hematocrit",
  MCV: "Mean cell volume (MCV)",
  MCH: "Mean cell hemoglobin (MCH)",
  MCHC: "MCH concentration (MCHC)",
  RDW: "Red cell distribution width (RDW)",
  "PLATELET COUNT": "Platelets",
  MPV: "Mean platelet volume (MPV)",
  "ABSOLUTE NEUTROPHILS": "Neutrophils (absolute)",
  "ABSOLUTE LYMPHOCYTES": "Lymphocytes (absolute)",
  "ABSOLUTE MONOCYTES": "Monocytes (absolute)",
  "ABSOLUTE EOSINOPHILS": "Eosinophils (absolute)",
  "ABSOLUTE BASOPHILS": "Basophils (absolute)",
  NEUTROPHILS: "Neutrophils (%)",
  LYMPHOCYTES: "Lymphocytes (%)",
  MONOCYTES: "Monocytes (%)",
  EOSINOPHILS: "Eosinophils (%)",
  BASOPHILS: "Basophils (%)",
  GLUCOSE: "Glucose",
  "UREA NITROGEN (BUN)": "Urea nitrogen (BUN)",
  CREATININE: "Creatinine",
  "eGFR NON-AFR. AMERICAN": "eGFR",
  "eGFR AFRICAN AMERICAN": "eGFR (race-adjusted, legacy)",
  "BUN/CREATININE RATIO": "BUN/creatinine ratio",
  SODIUM: "Sodium",
  POTASSIUM: "Potassium",
  CHLORIDE: "Chloride",
  "CARBON DIOXIDE": "Bicarbonate (CO₂)",
  CALCIUM: "Calcium",
  "PROTEIN; TOTAL": "Total protein",
  ALBUMIN: "Albumin",
  GLOBULIN: "Globulin",
  "ALBUMIN/GLOBULIN RATIO": "Albumin/globulin ratio",
  "BILIRUBIN; TOTAL": "Bilirubin (total)",
  "ALKALINE PHOSPHATASE": "Alkaline phosphatase (ALP)",
  AST: "AST",
  ALT: "ALT",
  CRP: "C-reactive protein (CRP)",
  AGP: "α1-acid glycoprotein (AGP)",
  "a-2 Macroglobulin": "α2-macroglobulin",
  "Fetuin A36": "Fetuin-A",
  "L-Selectin": "L-selectin",
  SAP: "Serum amyloid P (SAP)",
};

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/α/g, "a")
    .replace(/β/g, "b")
    .replace(/γ/g, "g")
    .replace(/δ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function displayName(raw: string) {
  if (NAMES[raw]) return NAMES[raw];
  if (raw === raw.toUpperCase() && /[A-Z]{4,}/.test(raw)) {
    return raw.charAt(0) + raw.slice(1).toLowerCase();
  }
  return raw;
}

/** Unit conversions applied on load, to units clinicians recognise. */
const CONVERT: Record<string, { unit: string; factor: number }> = {
  // 1 mg/L = 1 µg/mL = 1e6 pg/mL
  CRP: { unit: "mg/L", factor: 1e-6 },
};

interface RawCell {
  raw: string;
  subject: string;
  timepoint: string;
  value: number | null;
  unit: string;
  refMin: number | null;
  refMax: number | null;
}

function cellsFromClinical(objs: Record<string, string>[]): RawCell[] {
  return objs.map((o) => ({
    raw: (o.ANALYTE ?? "").replace(/\s*\(FEMALE\)\s*$/i, "").trim(),
    subject: o.SUBJECT_ID ?? "",
    timepoint: o.TEST_DATE ?? o.timepoint ?? o.TIMEPOINT ?? "",
    value: num(o.VALUE),
    unit: o.UNITS ?? "",
    refMin: num(o.RANGE_MIN),
    refMax: num(o.RANGE_MAX),
  }));
}

function cellsFromMultiplex(objs: Record<string, string>[]): RawCell[] {
  return objs.map((o) => ({
    raw: (o.Analyte ?? "").trim(),
    subject: o.ID ?? "",
    timepoint: o.Timepoint ?? "",
    value: num(o.Concentration),
    unit: o.Unit ?? "",
    refMin: null,
    refMax: null,
  }));
}

function sameRange(a: RefRange | null, b: RefRange | null) {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Pivot long-format cells into compact per-analyte matrices. */
export function buildAnalytes(panel: Panel, cells: RawCell[]): I4Analyte[] {
  const subjIdx = new Map<string, number>(I4_SUBJECTS.map((s, i) => [s.id, i]));
  const tpIdx = new Map<string, number>(TIMEPOINTS.map((t, i) => [t, i]));
  const byName = new Map<string, RawCell[]>();
  for (const c of cells) {
    if (!c.raw || !subjIdx.has(c.subject) || !tpIdx.has(c.timepoint.trim())) continue;
    const list = byName.get(c.raw) ?? [];
    list.push(c);
    byName.set(c.raw, list);
  }

  const out: I4Analyte[] = [];
  for (const [raw, list] of byName) {
    const conv = CONVERT[raw];
    const f = conv?.factor ?? 1;
    const values = I4_SUBJECTS.map(() => TIMEPOINTS.map(() => null as number | null));
    const refs = I4_SUBJECTS.map(() => TIMEPOINTS.map(() => null as RefRange | null));
    const counts = new Map<string, { r: RefRange; n: number }>();
    for (const c of list) {
      const s = subjIdx.get(c.subject)!;
      const t = tpIdx.get(c.timepoint.trim())!;
      values[s][t] = c.value == null ? null : round(c.value * f);
      if (c.refMin != null || c.refMax != null) {
        const r: RefRange = [c.refMin, c.refMax];
        refs[s][t] = r;
        const k = r.join("|");
        counts.set(k, { r, n: (counts.get(k)?.n ?? 0) + 1 });
      }
    }
    const modal = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.r ?? null;
    const uniform = refs.every((row, s) =>
      row.every((r, t) => values[s][t] == null || r == null || sameRange(r, modal)),
    );

    // Data-quality flags: a clinical value far off the same person's other draws.
    const flags: I4Flag[] = [];
    if (PANEL_DEFS[panel].kind === "clinical") {
      values.forEach((row, s) => {
        const present = row.filter((v): v is number => v != null && v > 0);
        if (present.length < 4) return;
        const med = median(present);
        row.forEach((v, t) => {
          if (v == null || med <= 0) return;
          if (v < med / 5 || v > med * 5) {
            flags.push({
              subject: I4_SUBJECTS[s].id,
              timepoint: TIMEPOINTS[t],
              kind: "suspect",
              note: `Implausible vs this person's other draws (median ${fmt(med)}): likely a transcription error in the source file (e.g. misplaced decimal). Shown as published, excluded from baselines.`,
            });
          }
        });
      });
    }

    // Sex-specific ranges: the lab sometimes attached the male interval to a female draw.
    if (!uniform) {
      const key = (r: RefRange | null) => (r ? r.join("|") : "");
      const maleR = new Set<string>();
      const femaleR = new Map<string, RefRange>();
      I4_SUBJECTS.forEach((s, si) =>
        refs[si].forEach((r) => {
          if (r && s.sex === "M") maleR.add(key(r));
        }),
      );
      I4_SUBJECTS.forEach((s, si) =>
        refs[si].forEach((r) => {
          if (r && s.sex === "F" && !maleR.has(key(r))) femaleR.set(key(r), r);
        }),
      );
      const fr = [...femaleR.values()][0];
      if (fr) {
        I4_SUBJECTS.forEach((s, si) => {
          if (s.sex !== "F") return;
          refs[si].forEach((r, t) => {
            if (r && maleR.has(key(r))) {
              flags.push({
                subject: s.id,
                timepoint: TIMEPOINTS[t],
                kind: "range",
                note: `Lab reported the male reference range (${r[0] ?? "–"}–${r[1] ?? "–"}) for this female participant; the female range is ${fr[0] ?? "–"}–${fr[1] ?? "–"}. Shown as published.`,
              });
            }
          });
        });
      }
    }

    const unit = conv?.unit ?? list[0].unit;
    out.push({
      id: slug(raw),
      name: displayName(raw),
      rawName: raw,
      panel,
      unit,
      values,
      ref: modal,
      ...(uniform ? {} : { refs }),
      ...(flags.length ? { flags } : {}),
    });
  }
  return out;
}

function round(v: number) {
  return Number.parseFloat(v.toPrecision(5));
}

function fmt(v: number) {
  return Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

interface FileListing {
  studies?: Record<string, { study_files?: { file_name: string; remote_url: string }[] }>;
}

/** Download one OSDR study file as text (resolves the listing, follows the S3 redirect). */
export async function downloadStudyFile(accession: string, file: string): Promise<string> {
  const n = accession.replace(/^OSD-/, "");
  let remote = `/geode-py/ws/studies/${accession}/download?source=datamanager&file=${encodeURIComponent(file)}`;
  try {
    const listing = await fetchJson<FileListing>(`${config.osdrBaseUrl}/osdr/data/osd/files/${n}`);
    const hit = listing.studies?.[accession]?.study_files?.find((f) => f.file_name === file);
    if (hit) remote = hit.remote_url.replace(/ /g, "%20");
  } catch {
    // Fall back to the documented download URL pattern.
  }
  const res = await fetch(`${config.osdrBaseUrl}${remote}`, {
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(config.fetchTimeoutMs, 20_000)),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} downloading ${file}`);
  return res.text();
}

async function loadPanel(panel: Panel): Promise<I4PanelData> {
  const def = PANEL_DEFS[panel];
  const text = await downloadStudyFile(def.accession, def.file);
  const objs = csvObjects(text);
  const cells = def.kind === "clinical" ? cellsFromClinical(objs) : cellsFromMultiplex(objs);
  const analytes = buildAnalytes(panel, cells);
  if (analytes.length === 0) throw new Error(`No analytes parsed from ${def.file}`);
  return {
    panel,
    label: def.label,
    kind: def.kind,
    description: def.description,
    study: {
      accession: def.accession,
      title: STUDY_TITLES[def.accession] ?? def.accession,
      file: def.file,
      url: studyUrl(def.accession),
    },
    analytes,
  };
}

function panelSource(panel: Panel) {
  return `NASA OSDR ${PANEL_DEFS[panel].accession} (Inspiration4 ${PANEL_DEFS[panel].label})`;
}

/** One Inspiration4 panel, parsed and normalised. Cached 7 days + offline snapshot. */
export function getInspiration4Panel(panel: Panel): Promise<SourceResult<I4PanelData>> {
  return cached(`osdr-i4-${panel.toLowerCase()}-v${SCHEMA}`, panelSource(panel), () => loadPanel(panel), WEEK);
}

/** All four panels. Panels that fail (no network and no snapshot) are returned in `errors`. */
export async function getInspiration4(): Promise<{
  panels: SourceResult<I4PanelData>[];
  errors: { panel: Panel; error: string }[];
}> {
  const settled = await Promise.allSettled(PANELS.map((p) => getInspiration4Panel(p)));
  const panels: SourceResult<I4PanelData>[] = [];
  const errors: { panel: Panel; error: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") panels.push(r.value);
    else errors.push({ panel: PANELS[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  return { panels, errors };
}

/** Expand compact matrices into flat rows (optionally one analyte). */
export function toRows(data: I4PanelData, analyteId?: string): I4Row[] {
  const rows: I4Row[] = [];
  for (const a of data.analytes) {
    if (analyteId && a.id !== analyteId) continue;
    a.values.forEach((row, s) =>
      row.forEach((value, t) => {
        const r = a.refs?.[s]?.[t] ?? a.ref;
        rows.push({
          analyte: a.name,
          analyteId: a.id,
          panel: a.panel,
          subject: I4_SUBJECTS[s].id,
          sex: I4_SUBJECTS[s].sex,
          timepoint: TIMEPOINTS[t],
          day: timepointDay(TIMEPOINTS[t])!,
          value,
          unit: a.unit,
          refMin: r?.[0] ?? null,
          refMax: r?.[1] ?? null,
        });
      }),
    );
  }
  return rows;
}

// --------------------------------------------------- "what changed" summary

export interface ChangeCell {
  subject: SubjectId;
  /** Mean of available pre-flight draws (flagged values excluded). */
  baseline: number | null;
  postflight: number | null;
  /** % change R+1 vs pre-flight mean. */
  pct: number | null;
  /** Position of the R+1 value relative to the lab reference interval. */
  range: "low" | "high" | "in" | "none";
  notable: boolean;
}

export interface ChangeRow {
  panel: Panel;
  analyteId: string;
  name: string;
  unit: string;
  cells: ChangeCell[];
  /** Crew mean of the per-person % change. */
  meanPct: number | null;
}

/** Analytes summarised in "what changed after flight". */
export const KEY_ANALYTES: { panel: Panel; id: string }[] = [
  { panel: "CMP", id: "glucose" },
  { panel: "CMP", id: "calcium" },
  { panel: "CMP", id: "alkaline-phosphatase" },
  { panel: "CMP", id: "creatinine" },
  { panel: "CBC", id: "white-blood-cell-count" },
  { panel: "CBC", id: "absolute-lymphocytes" },
  { panel: "CBC", id: "absolute-neutrophils" },
  { panel: "CBC", id: "hemoglobin" },
  { panel: "CBC", id: "platelet-count" },
  { panel: "CARDIO", id: "crp" },
  { panel: "CYTOKINE", id: "il-6" },
  { panel: "CYTOKINE", id: "tnfa" },
];

export function rangePosition(v: number | null, r: RefRange | null | undefined): ChangeCell["range"] {
  if (v == null || !r) return "none";
  if (r[0] != null && v < r[0]) return "low";
  if (r[1] != null && v > r[1]) return "high";
  return "in";
}

export function summarizeChanges(panels: I4PanelData[], keys = KEY_ANALYTES): ChangeRow[] {
  const post = TIMEPOINTS.indexOf("R+1");
  const pre = PRE_FLIGHT.map((t) => TIMEPOINTS.indexOf(t));
  const rows: ChangeRow[] = [];
  for (const k of keys) {
    const p = panels.find((x) => x.panel === k.panel);
    const a = p?.analytes.find((x) => x.id === k.id);
    if (!p || !a) continue;
    const notableAt = p.kind === "clinical" ? 15 : 50;
    const cells: ChangeCell[] = I4_SUBJECTS.map((s, si) => {
      const flagged = new Set(
        (a.flags ?? []).filter((f) => f.subject === s.id && f.kind === "suspect").map((f) => f.timepoint),
      );
      const base = pre
        .filter((t) => !flagged.has(TIMEPOINTS[t]))
        .map((t) => a.values[si][t])
        .filter((v): v is number => v != null);
      const baseline = base.length ? base.reduce((x, y) => x + y, 0) / base.length : null;
      const postflight = a.values[si][post];
      const pct = baseline && postflight != null ? ((postflight - baseline) / baseline) * 100 : null;
      const range = rangePosition(postflight, a.refs?.[si]?.[post] ?? a.ref);
      return {
        subject: s.id,
        baseline: baseline == null ? null : round(baseline),
        postflight,
        pct: pct == null ? null : Math.round(pct * 10) / 10,
        range,
        notable: (pct != null && Math.abs(pct) >= notableAt) || range === "low" || range === "high",
      };
    });
    const pcts = cells.map((c) => c.pct).filter((v): v is number => v != null);
    rows.push({
      panel: p.panel,
      analyteId: a.id,
      name: a.name,
      unit: a.unit,
      cells,
      meanPct: pcts.length ? Math.round((pcts.reduce((x, y) => x + y, 0) / pcts.length) * 10) / 10 : null,
    });
  }
  return rows;
}

// -------------------------------------------------------------- study search

export interface StudyHit {
  accession: string;
  title: string;
  organism: string;
  mission: string | null;
  flightProgram: string | null;
  spaceProgram: string | null;
  projectType: string | null;
  measurement: string[];
  technology: string[];
  material: string | null;
  releaseDate: string | null;
  description: string;
  url: string;
}

export interface StudySearch {
  query: string;
  total: number;
  from: number;
  hits: StudyHit[];
}

interface RawSearch {
  hits?: {
    total?: number | { value: number };
    hits?: { _source?: Record<string, unknown> }[];
  };
}

export const DEFAULT_SEARCH = "human health";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
/** OSDR joins multi-valued fields with runs of spaces. */
function multi(v: unknown): string[] {
  return [...new Set(str(v).split(/\s{3,}/).map((s) => s.trim()).filter(Boolean))];
}

function normaliseHit(s: Record<string, unknown>): StudyHit | null {
  const accession = str(s.Accession) || str(s["Study Identifier"]);
  if (!accession) return null;
  const mission = s.Mission as { Name?: string } | undefined;
  const release = typeof s["Study Public Release Date"] === "number" ? (s["Study Public Release Date"] as number) : 0;
  const desc = str(s["Study Description"]).replace(/\s+/g, " ");
  return {
    accession,
    title: str(s["Study Title"]) || accession,
    organism: multi(s.organism).join(", ") || "—",
    mission: str(mission?.Name) || null,
    flightProgram: str(s["Flight Program"]) || null,
    spaceProgram: str(s["Space Program"]) || null,
    projectType: str(s["Project Type"]) || null,
    measurement: multi(s["Study Assay Measurement Type"]).slice(0, 4),
    technology: multi(s["Study Assay Technology Type"]).slice(0, 4),
    material: multi(s["Material Type"]).slice(0, 3).join(", ") || null,
    releaseDate: release > 0 ? new Date(release * 1000).toISOString().slice(0, 10) : null,
    description: desc.length > 320 ? `${desc.slice(0, 317).trimEnd()}…` : desc,
    url: studyUrl(accession),
  };
}

async function loadSearch(q: string, size: number, from: number): Promise<StudySearch> {
  const url = `${config.osdrBaseUrl}/osdr/data/search?term=${encodeURIComponent(q)}&type=cgene&size=${size}&from=${from}`;
  const raw = await fetchJson<RawSearch>(url);
  const total = typeof raw.hits?.total === "number" ? raw.hits.total : (raw.hits?.total?.value ?? 0);
  const hits = (raw.hits?.hits ?? [])
    .map((h) => (h._source ? normaliseHit(h._source) : null))
    .filter((h): h is StudyHit => h != null);
  return { query: q, total, from, hits };
}

const SEARCH_SRC = "NASA OSDR study search";
const searchMemory = new Map<string, { at: number; value: StudySearch }>();
/** Last failed live search per query, for the same short retry backoff the cached sources use. */
const searchFailures = new Map<string, { at: number; error: unknown }>();
const SEARCH_BACKOFF_MS = 60_000;
const SEARCH_MEMORY_MAX = 50;

function remember<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  if (map.size >= SEARCH_MEMORY_MAX) map.delete(map.keys().next().value!);
  map.set(key, value);
}

/**
 * Example queries that ship with a snapshot (data/snapshots/osdr-search-<slug>.json),
 * so the matching suggestion chips still answer offline. Lower case; first page only.
 */
export const SEEDED_SEARCHES = ["inspiration4", "bone loss", "space radiation"] as const;

/** Snapshot key of a seeded query, e.g. "bone loss" -> "osdr-search-bone-loss". */
export function seededSearchKey(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (q === DEFAULT_SEARCH) return "osdr-search-default";
  if (!(SEEDED_SEARCHES as readonly string[]).includes(q)) return null;
  return `osdr-search-${q.replace(/[^a-z0-9]+/g, "-")}`;
}

/** Thrown when a query needs OSDR but the app runs with DEMIFY_OFFLINE=true. */
export class SearchOfflineError extends Error {
  constructor() {
    super("Study search needs a network connection (offline mode)");
    this.name = "SearchOfflineError";
  }
}

/**
 * Full-text search over OSDR studies. The default query and the seeded
 * example queries (first page) are snapshotted; other queries never create
 * files and use a small in-memory cache (1 h) instead, with the same
 * fallbacks as cached(): a failed live search is not retried for 60 s, and
 * an expired copy in memory is served (with the error) while OSDR fails.
 */
export async function searchStudies(q: string, size = 10, from = 0): Promise<SourceResult<StudySearch>> {
  const query = q.trim().slice(0, 120) || DEFAULT_SEARCH;
  const n = Math.min(25, Math.max(1, Math.floor(size)));
  const start = Math.min(500, Math.max(0, Math.floor(from)));
  const seedKey = n === 10 && start === 0 ? seededSearchKey(query) : null;
  if (seedKey) {
    const term = query.toLowerCase() === DEFAULT_SEARCH ? DEFAULT_SEARCH : query;
    return cached(seedKey, SEARCH_SRC, () => loadSearch(term, 10, 0), HOUR);
  }
  const key = `${query.toLowerCase()}|${n}|${start}`;
  const hit = searchMemory.get(key);
  const now = Date.now();
  const fromMemory = (error?: string): SourceResult<StudySearch> => ({
    data: hit!.value,
    source: SEARCH_SRC,
    freshness: "cache",
    fetchedAt: new Date(hit!.at).toISOString(),
    ...(error ? { error } : {}),
  });
  if (hit && now - hit.at < HOUR * 1000) return fromMemory();
  if (config.offline) throw new SearchOfflineError();
  const failed = searchFailures.get(key);
  if (failed && now - failed.at < SEARCH_BACKOFF_MS) {
    // Failed moments ago: answer at once instead of waiting out another timeout.
    if (hit) return fromMemory(errorText(failed.error));
    throw failed.error;
  }
  let value: StudySearch;
  try {
    value = await loadSearch(query, n, start);
  } catch (e) {
    remember(searchFailures, key, { at: Date.now(), error: e });
    if (hit) return fromMemory(errorText(e));
    throw e;
  }
  searchFailures.delete(key);
  remember(searchMemory, key, { at: now, value });
  return { data: value, source: SEARCH_SRC, freshness: "live", fetchedAt: new Date(now).toISOString() };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Why a query got the cached default list instead of its own results. */
export type SearchFallbackReason = "offline-mode" | "unreachable" | "osdr-error";

/** Status line per fallback reason (the cached default list is shown instead). */
export const SEARCH_FALLBACK_MESSAGE: Record<SearchFallbackReason, string> = {
  "offline-mode": "Search needs a connection; showing the cached default list",
  unreachable: "OSDR could not be reached; showing the cached default list",
  "osdr-error": "OSDR did not answer; showing the cached default list",
};

/** Shown when a query cannot reach OSDR in offline mode and the cached default list is returned instead. */
export const SEARCH_OFFLINE_MESSAGE = SEARCH_FALLBACK_MESSAGE["offline-mode"];

/** 503 text per reason, when not even the default list is cached. */
const NO_LIST_MESSAGE: Record<SearchFallbackReason, string> = {
  "offline-mode": "Search needs a connection, and no cached list is available yet",
  unreachable: "OSDR could not be reached, and no cached list is available yet",
  "osdr-error": "OSDR did not answer, and no cached list is available yet",
};

/** Body of GET /api/osdr/search. */
export type StudySearchResponse =
  | (StudySearch & {
      provenance: Omit<SourceResult<unknown>, "data">;
      /** Set when the query could not reach OSDR and this is the cached default list instead. */
      offline?: {
        /**
         * "offline-mode": DEMIFY_OFFLINE=true, search stays off; "unreachable":
         * network error or timeout; "osdr-error": OSDR answered with an HTTP
         * error. Retry later for the last two.
         */
        reason: SearchFallbackReason;
        /** The query the user asked for. */
        requested: string;
        message: string;
      };
    })
  | { error: string; query: string; offline?: true; reason?: SearchFallbackReason };

/**
 * Study search with an offline fallback, for the API route. A query that
 * cannot reach OSDR (offline mode, or the live request failed with no cached
 * copy) answers 200 with the cached default list and `offline` set, instead
 * of an error. Only when even the default list is missing does it answer 503.
 */
export async function searchStudiesOrDefault(
  q: string,
  size = 10,
  from = 0,
): Promise<{ status: number; body: StudySearchResponse }> {
  const prov = (r: SourceResult<unknown>) => ({ source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, error: r.error });
  try {
    const r = await searchStudies(q, size, from);
    return { status: 200, body: { ...r.data, provenance: prov(r) } };
  } catch (e) {
    const reason: SearchFallbackReason =
      e instanceof SearchOfflineError || config.offline ? "offline-mode" : e instanceof HttpStatusError ? "osdr-error" : "unreachable";
    const error = errorText(e);
    try {
      const d = await searchStudies(DEFAULT_SEARCH);
      return {
        status: 200,
        body: {
          ...d.data,
          provenance: { ...prov(d), error: d.error ?? error },
          offline: { reason, requested: q.trim().slice(0, 120), message: SEARCH_FALLBACK_MESSAGE[reason] },
        },
      };
    } catch {
      return {
        status: 503,
        body: { error: NO_LIST_MESSAGE[reason], query: q, offline: true, reason },
      };
    }
  }
}

// ------------------------------------------------------------ mission studies

export interface MissionStudies {
  mission: string;
  startDate: string | null;
  endDate: string | null;
  vehicle: string | null;
  studies: { accession: string; title: string | null; organism: string | null; measurement: string[]; url: string }[];
}

interface RawMission {
  identifier?: string;
  startDate?: string;
  endDate?: string;
  vehicle?: { vehicle?: string };
  parents?: { GLDS_Study?: { GLDS_Study: string }[] };
}

function usDate(s: string | undefined): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s ?? "");
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

async function loadMission(name: string): Promise<MissionStudies> {
  const raw = await fetchJson<RawMission>(`${config.osdrBaseUrl}/geode-py/ws/api/mission/${encodeURIComponent(name)}`);
  const accessions = (raw.parents?.GLDS_Study ?? [])
    .map((g) => /\/(\d+)\/?$/.exec(g.GLDS_Study)?.[1])
    .filter((n): n is string => !!n)
    .map((n) => `OSD-${n}`);
  // Titles come from the search index (one request instead of one per study).
  const titles = new Map<string, StudyHit>();
  try {
    const s = await loadSearch("Inspiration4", 25, 0);
    s.hits.forEach((h) => titles.set(h.accession, h));
  } catch {
    // Titles are optional.
  }
  const uniq = [...new Set(accessions)].sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
  return {
    mission: raw.identifier ?? name,
    startDate: usDate(raw.startDate),
    endDate: usDate(raw.endDate),
    vehicle: raw.vehicle?.vehicle ? decodeURIComponent(raw.vehicle.vehicle.split("/").pop() ?? "") : null,
    studies: uniq.map((acc) => {
      const h = titles.get(acc);
      return {
        accession: acc,
        title: h?.title ?? STUDY_TITLES[acc] ?? null,
        organism: h?.organism ?? null,
        measurement: h?.measurement ?? [],
        url: studyUrl(acc),
      };
    }),
  };
}

/** All OSDR studies linked to the Inspiration4 mission. Cached 7 days + snapshot. */
export async function getMissionStudies(): Promise<SourceResult<MissionStudies>> {
  const r = await cached("osdr-mission-i4", "NASA OSDR mission registry", () => loadMission(I4_MISSION.name), WEEK);
  // Fill titles the search index lacks (also for older snapshots).
  return {
    ...r,
    data: { ...r.data, studies: r.data.studies.map((s) => ({ ...s, title: s.title ?? STUDY_TITLES[s.accession] ?? null })) },
  };
}
