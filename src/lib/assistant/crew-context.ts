import "server-only";
import { assessCrewMember, type CrewAssessment } from "../health/assess";
import { INDICATORS } from "../health/knowledge";
import { getLiveVitals } from "../monitor/live";
import type { AssistantAnswer } from "../onboard/types";
import type { LiveVitals, Reading } from "../types";

/**
 * Crew data the assistant may use as context ([C] in its answer): the
 * crew member's overall status from the rule engine, the indicators in
 * caution or critical, and the latest live sample with its data label.
 * The rule engine stays primary: this only describes what it already shows.
 */

export type CrewContext = NonNullable<AssistantAnswer["crewContext"]>;

/** Data labels as on the crew and monitor pages. */
const READING_LABEL: Record<Reading["source"], string> = {
  manual: "Crew entry",
  sensor: "DEVICE",
  simulated: "SIMULATED",
  osdr: "NASA OSDR",
  "noaa-swpc": "NOAA SWPC estimate",
};
const LIVE_LABEL: Record<LiveVitals["source"], string> = {
  simulated: "SIMULATED",
  sensor: "DEVICE",
  mixed: "DEVICE + SIMULATED",
};

/** Indicators listed at most (most severe first). */
const MAX_FLAGGED = 8;

/** "2026-11-14 08:50 UTC" */
function utc(iso: string): string {
  return `${iso.replace("T", " ").slice(0, 16)} UTC`;
}

function liveValues(live: LiveVitals): string[] {
  const out: string[] = [];
  if (live.hr != null) out.push(`heart rate ${live.hr} bpm (${live.rhythm === "vf" || live.rhythm === "vt" ? live.rhythm.toUpperCase() : live.rhythm.replace(/-/g, " ")})`);
  else if (live.rhythm === "vf" || live.rhythm === "vt") out.push(`rhythm ${live.rhythm.toUpperCase()}, no measurable heart rate`);
  if (live.sys != null && live.dia != null) out.push(`blood pressure ${live.sys}/${live.dia} mmHg`);
  if (live.spo2 != null) out.push(`SpO₂ ${live.spo2} %`);
  if (live.resp != null) out.push(`respiratory rate ${live.resp} /min`);
  if (live.temp != null) out.push(`temperature ${live.temp} °C`);
  if (live.stMm) out.push(`ST deviation ${live.stMm} mm`);
  return out;
}

/** Builds the context from the assessment and the live sample (either may be missing). */
export function summariseCrew(crewId: string, assessment: CrewAssessment | null, live: LiveVitals | null): CrewContext | null {
  if (!assessment && !live) return null;
  const crewName = assessment?.crew.name ?? live?.crewName ?? crewId;
  const role = assessment?.crew.role;
  const lines: string[] = [];
  const times: string[] = [];
  const labels = new Set<string>();

  if (assessment) {
    lines.push(`${crewName}${role && role !== crewName ? ` (${role})` : ""}. Overall status from the rule engine: ${assessment.overall}.`);
    const rank = { critical: 2, caution: 1 } as Record<string, number>;
    const flagged = assessment.assessments
      .filter((a) => a.status === "caution" || a.status === "critical")
      .sort((a, b) => (rank[b.status] ?? 0) - (rank[a.status] ?? 0));
    if (flagged.length) {
      const items = flagged.slice(0, MAX_FLAGGED).map((a) => {
        const def = INDICATORS[a.indicator];
        const source = assessment.sources[a.indicator];
        if (source) labels.add(READING_LABEL[source]);
        if (a.takenAt) times.push(a.takenAt);
        const value = a.value == null ? "" : ` ${Number(a.value.toFixed(def.decimals))} ${def.unit}`;
        const meta = [a.status, source ? READING_LABEL[source] : null, a.drill ? "DRILL" : null, a.takenAt ? utc(a.takenAt) : null]
          .filter(Boolean)
          .join(", ");
        return `${def.short}${value} (${meta})${a.finding ? `: ${a.finding}` : ""}`;
      });
      const more = flagged.length > MAX_FLAGGED ? ` (and ${flagged.length - MAX_FLAGGED} more)` : "";
      lines.push(`Indicators in caution or critical: ${items.join("; ")}${more}.`);
    } else {
      lines.push("No indicator is in caution or critical.");
    }
  } else {
    lines.push(`${crewName}.`);
  }

  let liveAt: string | null = null;
  if (live) {
    const values = liveValues(live);
    if (values.length) {
      liveAt = live.t;
      labels.add(LIVE_LABEL[live.source]);
      lines.push(`Latest live sample (${LIVE_LABEL[live.source]}, ${utc(live.t)}): ${values.join(", ")}.`);
    }
  }
  const drill = live?.scenario ?? assessment?.scenario ?? null;
  if (drill) lines.push(`Training drill running (DRILL): ${drill.label}.`);

  const newest = [liveAt, ...times].filter((t): t is string => !!t && Number.isFinite(Date.parse(t))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const source = liveAt ? LIVE_LABEL[live!.source] : labels.size ? [...labels].join(" + ") : "no data recorded";
  return { crewId, crewName, summary: lines.join(" "), takenAt: newest ?? null, source };
}

/** Context for one crew member, or null (unknown crew member, or nothing could be read). Never throws. */
export async function crewContextFor(crewId: string): Promise<CrewContext | null> {
  const [assessment, live] = await Promise.all([
    assessCrewMember(crewId).catch(() => null),
    getLiveVitals(crewId).catch(() => null),
  ]);
  return summariseCrew(crewId, assessment, live);
}
