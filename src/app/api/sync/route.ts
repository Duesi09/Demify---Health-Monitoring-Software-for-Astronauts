import { SYNC_LINK_DOWN_REASON, syncNow } from "@/lib/assistant/library-source";
import { isCrossOrigin, requireAdmin } from "@/lib/http";
import { isGroundLinkUp } from "@/lib/onboard/ground-link";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/sync ("Sync now") -> { library: SyncResult }: pulls the ground
 * library into the onboard database at once. Same guards as the other
 * write routes (same-origin, admin token when DEMIFY_ADMIN_TOKEN is set).
 * 409 while the ground link is down (nothing to sync from) or when there is
 * no database; 503 while the database is unreachable. The data snapshots are
 * refreshed by the sync service on its own schedule.
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403, headers: NO_STORE });
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!(await isGroundLinkUp())) {
    return Response.json({ error: SYNC_LINK_DOWN_REASON, reason: SYNC_LINK_DOWN_REASON }, { status: 409, headers: NO_STORE });
  }
  try {
    const out = await syncNow();
    if (!out.ok) return Response.json({ error: out.reason, reason: out.reason }, { status: out.status, headers: NO_STORE });
    return Response.json({ library: out.library }, { headers: NO_STORE });
  } catch (err) {
    console.error(`[demify] Library sync failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The library sync could not run" }, { status: 500, headers: NO_STORE });
  }
}
