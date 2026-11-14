import { getAllLiveVitals } from "@/lib/monitor/live";

export const dynamic = "force-dynamic";

/** GET /api/alarms — all active patient-monitor alarms across the crew (poll ~2 s). */
export async function GET() {
  const live = await getAllLiveVitals();
  const alarms = live.flatMap((v) => v.alarms);
  const scenarios = live.filter((v) => v.scenario).map((v) => v.scenario!);
  return Response.json({ alarms, scenarios, t: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
