import { z } from "zod";
import { config } from "@/lib/config";
import { addReadings, getCrew, listReadings } from "@/lib/store/readings";
import { simulateDaily, simulateSeries } from "@/lib/sources/simulator";
import type { IndicatorId } from "@/lib/types";

export const dynamic = "force-dynamic";

const INDICATORS = [
  "heartRate", "systolicBP", "diastolicBP", "spo2", "bodyTemp", "respRate", "glucose",
  "sleepHours", "mood", "stress", "radiationDoseRate", "radiationCumulative", "bodyMassChange",
  "boneLoss", "exerciseMinutes", "hydration", "wbc", "cabinCO2", "visionChange",
] as const satisfies readonly IndicatorId[];

const ReadingIn = z.object({
  crewId: z.string().min(1).max(64),
  indicator: z.enum(INDICATORS),
  value: z.number().finite(),
  unit: z.string().max(16),
  takenAt: z.iso.datetime().optional(),
  source: z.enum(["manual", "sensor"]).default("manual"),
  note: z.string().max(500).optional(),
});
const Batch = z.array(ReadingIn).min(1).max(500);

/**
 * GET /api/readings?crewId=cdr&indicator=heartRate&hours=24
 * Returns stored readings (manual + sensor) merged with simulated telemetry
 * when DEMIFY_SIMULATE is on.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const crewId = url.searchParams.get("crewId") ?? undefined;
  const indicator = (url.searchParams.get("indicator") ?? undefined) as IndicatorId | undefined;
  const hours = Math.min(24 * 30, Number(url.searchParams.get("hours") ?? 24));
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const stored = await listReadings({ crewId, indicator, since });
  let simulated: Awaited<ReturnType<typeof simulateSeries>> = [];
  if (config.simulateTelemetry && crewId) {
    const crew = await getCrew(crewId);
    if (crew) {
      const from = Date.parse(since);
      simulated = [
        ...simulateSeries(crew, Math.max(from, Date.now() - 48 * 3_600_000)),
        ...simulateDaily(crew, from),
      ].filter(
        (r) => !indicator || r.indicator === indicator,
      );
    }
  }
  const readings = [...simulated, ...stored].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return Response.json({ readings });
}

/**
 * POST /api/readings — manual check-ins and device ingestion.
 * Body: one reading or an array (max 500). Example:
 *   {"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"}
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Accept a single reading or a batch; validate as a batch for clear errors.
  const parsed = Batch.safeParse(Array.isArray(json) ? json : [json]);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const items = parsed.data;
  for (const r of items) {
    if (!(await getCrew(r.crewId))) {
      return Response.json({ error: `Unknown crewId ${r.crewId}` }, { status: 400 });
    }
  }
  const now = new Date().toISOString();
  const created = await addReadings(items.map((r) => ({ ...r, takenAt: r.takenAt ?? now })));
  return Response.json({ created }, { status: 201 });
}
