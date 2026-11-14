import { z } from "zod";
import { isCrossOrigin, isJson } from "@/lib/http";
import { getCrew } from "@/lib/store/readings";
import { listScenarios, SCENARIO_TYPES, startScenario, stopScenario } from "@/lib/store/scenarios";

export const dynamic = "force-dynamic";

const Start = z.object({
  crewId: z.string().min(1).max(64),
  type: z.enum(SCENARIO_TYPES as [string, ...string[]]),
});

/** GET /api/scenarios — active training scenarios. */
export async function GET() {
  return Response.json({ scenarios: await listScenarios() });
}

/** POST /api/scenarios {crewId, type} — start an emergency drill for one crew member. */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  if (!isJson(req)) return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 4096) return Response.json({ error: "Body too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Start.safeParse(body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  if (!(await getCrew(parsed.data.crewId))) return Response.json({ error: "Unknown crewId" }, { status: 400 });
  const scenario = await startScenario(parsed.data.crewId, parsed.data.type as (typeof SCENARIO_TYPES)[number]);
  return Response.json({ scenario }, { status: 201 });
}

/** DELETE /api/scenarios?crewId=cdr — end a drill (no crewId: end all). */
export async function DELETE(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  const crewId = new URL(req.url).searchParams.get("crewId") ?? undefined;
  await stopScenario(crewId);
  return Response.json({ ok: true });
}
