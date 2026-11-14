import { DEFAULT_SEARCH, searchStudies } from "@/lib/sources/osdr";

export const dynamic = "force-dynamic";

/**
 * GET /api/osdr/search?q=bone&size=10&from=0
 * Full-text search over NASA OSDR studies (server-side; OSDR has no CORS).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? DEFAULT_SEARCH;
  const size = Number(sp.get("size") ?? 10) || 10;
  const from = Number(sp.get("from") ?? 0) || 0;
  try {
    const r = await searchStudies(q, size, from);
    return Response.json({
      ...r.data,
      provenance: { source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, error: r.error },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), query: q }, { status: 502 });
  }
}
