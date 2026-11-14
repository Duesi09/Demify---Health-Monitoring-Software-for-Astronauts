import { listCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ crew: await listCrew() });
}
