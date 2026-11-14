import { getAllLiveVitals, getLiveVitals } from "@/lib/monitor/live";

export const dynamic = "force-dynamic";

/**
 * GET /api/vitals/live[?crewId=cdr] — instantaneous vitals for the patient
 * monitor (poll ~1 s). Without crewId: { crew: LiveVitals[] }.
 */
export async function GET(req: Request) {
  const crewId = new URL(req.url).searchParams.get("crewId");
  const headers = { "Cache-Control": "no-store" };
  if (crewId) {
    const v = await getLiveVitals(crewId);
    if (!v) return Response.json({ error: "Unknown crewId" }, { status: 404, headers });
    return Response.json(v, { headers });
  }
  return Response.json({ crew: await getAllLiveVitals() }, { headers });
}
