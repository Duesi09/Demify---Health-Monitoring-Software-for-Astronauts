/**
 * Client-safe helpers for the Open data (NASA OSDR) page: unit labels, number
 * formatting and short "why it matters in spaceflight" notes per analyte.
 * Analyte ids are the slugs produced by src/lib/sources/osdr.ts.
 */

export type PanelId = "CBC" | "CMP" | "CARDIO" | "CYTOKINE";

export interface AnalyteInfo {
  system: string;
  why: string;
}

export const ANALYTE_INFO: Record<string, AnalyteInfo> = {
  // Metabolic panel (CMP)
  glucose: {
    system: "Metabolism",
    why: "Launch and landing stress hormones such as cortisol, together with physical inactivity, reduce glucose tolerance; long-duration crews develop measurable glucose intolerance, so glucose is a simple screen for metabolic strain.",
  },
  calcium: {
    system: "Bone",
    why: "Without load on the skeleton, bones lose about 1–1.5 % of their mineral per month in orbit. Resorbed calcium leaves through the blood and urine (raising kidney-stone risk). Serum calcium is tightly regulated, so even small shifts are meaningful.",
  },
  "alkaline-phosphatase": {
    system: "Bone",
    why: "ALP (largely the bone-specific fraction) tracks bone formation by osteoblasts. In flight formation falls while resorption rises; after landing ALP often climbs as the skeleton starts rebuilding.",
  },
  creatinine: {
    system: "Kidney / muscle",
    why: "A breakdown product of muscle and the standard kidney-function marker. Muscle loss and the headward fluid shift in weightlessness both change it.",
  },
  "urea-nitrogen-bun": {
    system: "Kidney / hydration",
    why: "Reflects protein breakdown, hydration and kidney function. Crews often land mildly dehydrated after losing plasma volume in orbit.",
  },
  sodium: {
    system: "Fluids",
    why: "In weightlessness fluid shifts toward the head and the body sheds roughly 10–15 % of plasma volume. Electrolytes show how well fluid balance is restored after landing.",
  },
  potassium: {
    system: "Fluids / heart",
    why: "Muscle atrophy releases potassium, and low or high potassium can trigger heart-rhythm problems, which flight surgeons watch closely.",
  },
  albumin: {
    system: "Nutrition / fluids",
    why: "The main blood protein. It reflects nutrition and hydration and concentrates when plasma volume drops.",
  },
  ast: {
    system: "Liver / muscle",
    why: "A liver and muscle enzyme. It rises with liver stress (radiation, medications, diet) or with muscle damage during re-adaptation to gravity.",
  },
  alt: {
    system: "Liver",
    why: "A liver-specific enzyme. Rodent and twin studies link spaceflight to liver lipid and stress changes.",
  },
  // Blood count (CBC)
  "white-blood-cell-count": {
    system: "Immune",
    why: "Spaceflight dysregulates immunity: stress hormones move white cells between the blood and the tissues, and dormant viruses (EBV, VZV) can reactivate. The total white count is a first look at that shift.",
  },
  "absolute-lymphocytes": {
    system: "Immune",
    why: "T and B lymphocytes are sensitive to stress hormones and radiation. A drop at landing is a classic spaceflight finding and part of the immune dysregulation NASA monitors.",
  },
  "absolute-neutrophils": {
    system: "Immune",
    why: "Neutrophils usually rise with physical stress, so the neutrophil-to-lymphocyte ratio is a simple stress marker around launch and landing.",
  },
  hemoglobin: {
    system: "Blood",
    why: "'Space anemia': the body destroys about 54 % more red blood cells in space than on Earth (Trudel et al., Nature Medicine 2022). Plasma-volume loss hides this in flight, so it shows up after landing.",
  },
  hematocrit: {
    system: "Blood",
    why: "The share of blood volume made up of red cells. It moves with both red-cell loss (space anemia) and plasma-volume changes.",
  },
  "red-blood-cell-count": {
    system: "Blood",
    why: "Red cells carry oxygen. Destruction speeds up in weightlessness and only normalises months after return.",
  },
  "platelet-count": {
    system: "Blood / clotting",
    why: "Clotting cells. Spaceflight alters blood flow and coagulation (a jugular-vein clot was found in an ISS astronaut), so platelets are part of the cardiovascular picture.",
  },
  // Inflammation & cardiovascular (multiplex)
  crp: {
    system: "Inflammation",
    why: "An acute-phase protein the liver makes in response to IL-6. It summarises systemic inflammation from stress, radiation, tissue damage and re-entry forces.",
  },
  agp: {
    system: "Inflammation",
    why: "α1-acid glycoprotein is an acute-phase protein that rises over days after an inflammatory trigger.",
  },
  haptoglobin: {
    system: "Inflammation / blood",
    why: "Binds free hemoglobin from destroyed red cells, so it reflects both inflammation and red-cell breakdown (space anemia).",
  },
  fibrinogen: {
    system: "Clotting",
    why: "The clotting protein that forms fibrin; it is also an acute-phase protein and a cardiovascular-risk marker.",
  },
  "a-2-macroglobulin": {
    system: "Inflammation",
    why: "A protease inhibitor that buffers tissue damage during inflammation.",
  },
  pf4: {
    system: "Clotting",
    why: "Platelet factor 4 is released by activated platelets, a sign of clotting activity.",
  },
  "l-selectin": {
    system: "Immune / vessels",
    why: "Lets white cells roll along vessel walls into tissues; its shed form reflects immune-cell activation.",
  },
  sap: {
    system: "Inflammation",
    why: "Serum amyloid P is a pentraxin related to CRP that helps clear damaged cells.",
  },
  "fetuin-a36": {
    system: "Vessels / bone",
    why: "Fetuin-A inhibits calcium deposition in blood vessels, which matters when bone releases calcium in flight.",
  },
  // Cytokines (multiplex)
  "il-6": {
    system: "Inflammation / muscle",
    why: "A pro-inflammatory cytokine that skeletal muscle also releases under stress. It drives CRP production and is one of the most consistent spaceflight responders.",
  },
  tnfa: {
    system: "Inflammation / bone",
    why: "A master pro-inflammatory cytokine that also promotes bone resorption and muscle wasting.",
  },
  "il-1b": {
    system: "Inflammation",
    why: "An early pro-inflammatory signal from innate immune cells (inflammasome activation).",
  },
  "il-10": {
    system: "Immune regulation",
    why: "An anti-inflammatory cytokine that dampens immune responses; the balance of IL-10 against IL-6/TNFα matters.",
  },
  ifng: {
    system: "Immune",
    why: "The key antiviral T-cell cytokine. Reduced T-cell function in flight is linked to latent virus reactivation.",
  },
  "il-8": {
    system: "Immune",
    why: "Recruits neutrophils to sites of inflammation.",
  },
  "mcp-1": {
    system: "Immune / vessels",
    why: "Recruits monocytes into tissues and vessel walls, linking inflammation to cardiovascular risk.",
  },
  "ip-10": {
    system: "Immune",
    why: "An interferon-induced chemokine that rises with antiviral responses.",
  },
};

/** Analytes offered first in the picker, per panel (rest follow alphabetically). */
export const FEATURED: Record<PanelId, string[]> = {
  CMP: ["glucose", "calcium", "alkaline-phosphatase", "creatinine", "urea-nitrogen-bun", "sodium", "potassium", "albumin", "ast", "alt"],
  CBC: ["white-blood-cell-count", "absolute-lymphocytes", "absolute-neutrophils", "hemoglobin", "hematocrit", "red-blood-cell-count", "platelet-count"],
  CARDIO: ["crp", "agp", "haptoglobin", "fibrinogen", "pf4", "a-2-macroglobulin", "l-selectin", "sap", "fetuin-a36"],
  CYTOKINE: ["il-6", "tnfa", "il-1b", "il-10", "ifng", "il-8", "mcp-1", "ip-10"],
};

export const DEFAULT_ANALYTE: Record<PanelId, string> = {
  CMP: "glucose",
  CBC: "absolute-lymphocytes",
  CARDIO: "crp",
  CYTOKINE: "il-6",
};

const UNIT_LABELS: Record<string, string> = {
  "Thousand/uL": "×10³/µL",
  "Million/uL": "×10⁶/µL",
  "cells/uL": "cells/µL",
  "pg/ml": "pg/mL",
  "ng/ml": "ng/mL",
  "mL/min/1.73m2": "mL/min/1.73 m²",
  "(calc)": "",
};

export function unitLabel(u: string): string {
  return UNIT_LABELS[u] ?? u;
}

export function fmtValue(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 10_000) return Math.round(v).toLocaleString("en-US");
  if (a >= 100) return v.toFixed(0);
  if (Number.isInteger(v)) return String(v);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a === 0) return "0";
  return v.toPrecision(2);
}

/** Axis ticks: integers as-is, otherwise up to 3 significant digits. */
export function fmtTick(v: number): string {
  if (Number.isInteger(v)) return Math.abs(v) >= 10_000 ? v.toLocaleString("en-US") : String(v);
  return String(Number(v.toPrecision(3)));
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p).toFixed(Math.abs(p) >= 10 ? 0 : 1)} %`;
}

/** Crew line identity: colour slot + dash (dashed = female participant). */
export const SUBJECT_STYLE: Record<string, { color: string; dashed: boolean }> = {
  C001: { color: "var(--series-1)", dashed: false },
  C002: { color: "var(--series-2)", dashed: true },
  C003: { color: "var(--series-3)", dashed: true },
  C004: { color: "var(--series-4)", dashed: false },
};

