import { assessAllCrew, assessCrewMember } from "@/lib/health/assess";

export const dynamic = "force-dynamic";

/** GET /api/assessment[?crewId=cdr] — health status, findings, actions, escalations. */
export async function GET(req: Request) {
  const crewId = new URL(req.url).searchParams.get("crewId");
  if (crewId) {
    const a = await assessCrewMember(crewId);
    if (!a) return Response.json({ error: "Unknown crewId" }, { status: 404 });
    return Response.json(a);
  }
  return Response.json({ crew: await assessAllCrew() });
}
