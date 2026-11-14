import { onboardStatus } from "@/lib/assistant/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboard/status -> OnboardStatus: database, model server, ground
 * link and library (source, counts, pending embeddings, freshness, last
 * sync). Answers 200 in every state: "unreachable" and "not-configured" are
 * states, not errors.
 */
export async function GET() {
  try {
    return Response.json(await onboardStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`[demify] Onboard status failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "Could not read the onboard status" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
