import { currentMission } from "@/lib/config";
import { estimateDoseRate, getSpaceWeather } from "@/lib/sources/swpc";

export const dynamic = "force-dynamic";

/** Live solar radiation environment (NOAA SWPC) + indicative crew dose rate. */
export async function GET() {
  try {
    const sw = await getSpaceWeather();
    const mission = currentMission();
    return Response.json({ ...sw, dose: estimateDoseRate(sw.data.current.p10, mission), mission });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
