import { Droplet, Gauge, HeartPulse, Thermometer, Wind } from "lucide-react";
import type { SeriesDef } from "@/components/charts/time-series";
import { DailyGrid, type DailyRow } from "@/components/overview/daily-grid";
import { nominalBand } from "@/components/overview/format";
import { VitalTile, type VitalTileProps } from "@/components/overview/vital-tile";
import { Card } from "@/components/ui";
import { worst, type CrewAssessment } from "@/lib/health/assess";
import { INDICATORS } from "@/lib/health/knowledge";
import type { IndicatorId, Reading } from "@/lib/types";
import { pickSeries } from "./record-data";

const DAILY_IDS: IndicatorId[] = ["sleepHours", "mood", "stress", "hydration", "exerciseMinutes"];
const DAY_MS = 86_400_000;

/** 24 h vital-sign charts and the 7-day check-in grid for one crew member (as on the overview). */
export function CrewTrends({ a, readings, now }: { a: CrewAssessment; readings: Reading[]; now: number }) {
  const crew = a.crew;
  const since24 = now - DAY_MS;
  const byId = new Map(a.assessments.map((x) => [x.indicator, x]));

  const single = (id: IndicatorId, title: string, icon: VitalTileProps["icon"]): VitalTileProps => {
    const as = byId.get(id);
    const { points, basis } = pickSeries(readings, id, since24);
    const band = nominalBand(id);
    return {
      title,
      icon,
      parts: [{ id, value: as?.value ?? null, baseline: crew.baseline[id] }],
      status: as?.status ?? "unknown",
      source: a.sources[id],
      chart: {
        data: points.map((r) => ({ t: r.takenAt, v: r.value })),
        series: [{ key: "v", label: INDICATORS[id].short, color: "var(--series-1)" }],
        band: band ? { ...band, label: "Normal" } : undefined,
        basis,
      },
    };
  };

  const sys = pickSeries(readings, "systolicBP", since24);
  const dia = pickSeries(readings, "diastolicBP", since24);
  const bpRows = new Map<string, { t: string; sys: number | null; dia: number | null }>();
  for (const r of sys.points) bpRows.set(r.takenAt, { t: r.takenAt, sys: r.value, dia: null });
  for (const r of dia.points) {
    const row = bpRows.get(r.takenAt) ?? { t: r.takenAt, sys: null, dia: null };
    row.dia = r.value;
    bpRows.set(r.takenAt, row);
  }
  const bpSeries: SeriesDef[] = [
    { key: "sys", label: "Systolic", color: "var(--series-1)" },
    { key: "dia", label: "Diastolic", color: "var(--series-2)", dashed: true },
  ];
  const bp: VitalTileProps = {
    title: "Blood pressure",
    icon: Droplet,
    parts: [
      { id: "systolicBP", value: byId.get("systolicBP")?.value ?? null, baseline: crew.baseline.systolicBP, source: a.sources.systolicBP },
      { id: "diastolicBP", value: byId.get("diastolicBP")?.value ?? null, baseline: crew.baseline.diastolicBP, source: a.sources.diastolicBP },
    ],
    status: worst([byId.get("systolicBP")?.status ?? "unknown", byId.get("diastolicBP")?.status ?? "unknown"]),
    source: a.sources.systolicBP,
    chart: {
      data: [...bpRows.values()].sort((x, y) => x.t.localeCompare(y.t)),
      series: bpSeries,
      refLines: [
        { y: 130, label: "sys 130", tone: "caution" },
        { y: 80, label: "dia 80", tone: "caution" },
      ],
      basis: sys.basis === "measured" && dia.basis === "measured" ? "measured" : "simulated",
    },
  };

  const tiles: VitalTileProps[] = [
    single("heartRate", "Heart rate", HeartPulse),
    bp,
    single("spo2", "SpO₂", Gauge),
    single("bodyTemp", "Body temperature", Thermometer),
    single("respRate", "Respiratory rate", Wind),
  ];

  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => new Date(todayStart - (6 - i) * DAY_MS).toISOString().slice(0, 10));
  const rows: DailyRow[] = DAILY_IDS.map((id) => ({
    id,
    cells: days.map((d) => {
      const rs = readings.filter((r) => r.indicator === id && r.takenAt.startsWith(d));
      const real = rs.filter((r) => r.source !== "simulated");
      const pick = (real.length ? real : rs).at(-1);
      return pick ? { value: pick.value, source: pick.source } : null;
    }),
  }));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <VitalTile key={t.parts[0].id} {...t} />
        ))}
      </div>
      <Card
        title="Daily check-in, last 7 days"
        subtitle="Sleep, mood, stress, hydration and exercise. Bold values are real data: * crew entry, † sensor reading; others are simulated demo data."
      >
        <DailyGrid days={days} rows={rows} />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
          {DAILY_IDS.map((id) => (
            <li key={id}>
              <span className="text-fg">{INDICATORS[id].short}</span> normal: {INDICATORS[id].ranges.nominal}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
