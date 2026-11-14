import { getIssDoseReference, getMissionDose } from "@/lib/sources/eda";

export const dynamic = "force-dynamic";

/**
 * GET /api/osdr/eda               ISS absorbed-dose reference (8 missions, mGy/day)
 * GET /api/osdr/eda?mission=RR-12 one mission's daily GCR/SAA/total series
 */
export async function GET(req: Request) {
  const mission = new URL(req.url).searchParams.get("mission");
  try {
    const r = mission ? await getMissionDose(mission) : await getIssDoseReference();
    if (!r) return Response.json({ error: `No dose data for mission "${mission}"` }, { status: 404 });
    return Response.json({
      ...r.data,
      provenance: { source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, error: r.error },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
