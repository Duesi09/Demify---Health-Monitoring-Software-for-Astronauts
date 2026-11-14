import { z } from "zod";
import { isCrossOrigin, isJson, requireAdmin } from "@/lib/http";
import { getGroundLink, setGroundLink } from "@/lib/onboard/ground-link";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const Switch = z.object({
  up: z.boolean(),
  /** Optional label shown as "changed by"; defaults to "operator". */
  changedBy: z.string().trim().min(1).max(64).optional(),
});

/** GET /api/ground-link — the simulated ground link switch (GroundLinkState). */
export async function GET() {
  return Response.json(await getGroundLink(), { headers: NO_STORE });
}

/**
 * POST /api/ground-link {up: boolean} — switch the simulated ground link on
 * (normal mode) or off (blackout). Same guards as POST /api/scenarios:
 * same-origin, JSON, and the admin token when DEMIFY_ADMIN_TOKEN is set.
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!isJson(req)) return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 4096) return Response.json({ error: "Body too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Switch.safeParse(body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const state = await setGroundLink(parsed.data.up, parsed.data.changedBy ?? "operator");
    return Response.json(state, { headers: NO_STORE });
  } catch (err) {
    console.error(`[demify] Could not store the ground link switch: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "Could not store the ground link switch" }, { status: 500, headers: NO_STORE });
  }
}
