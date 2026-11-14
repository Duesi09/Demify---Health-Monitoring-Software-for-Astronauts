import { getMissionStudies } from "@/lib/sources/osdr";

export const dynamic = "force-dynamic";

/** GET /api/osdr/mission — OSDR studies linked to the SpaceX Inspiration4 mission. */
export async function GET() {
  try {
    const r = await getMissionStudies();
    return Response.json({
      ...r.data,
      provenance: { source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, error: r.error },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
