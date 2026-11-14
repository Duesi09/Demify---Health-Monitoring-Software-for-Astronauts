import { DEFAULT_SEARCH, searchStudiesOrDefault } from "@/lib/sources/osdr";

export const dynamic = "force-dynamic";

/**
 * GET /api/osdr/search?q=bone&size=10&from=0
 * Full-text search over NASA OSDR studies (server-side; OSDR has no CORS).
 *
 * Offline (DEMIFY_OFFLINE=true) or when OSDR cannot be reached, a query
 * without a snapshot answers 200 with the cached default list and
 * `offline: { reason, requested, message }`; 503 only if no list is cached.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q") ?? DEFAULT_SEARCH;
  const size = Number(sp.get("size") ?? 10) || 10;
  const from = Number(sp.get("from") ?? 0) || 0;
  const { status, body } = await searchStudiesOrDefault(q, size, from);
  return Response.json(body, { status });
}
