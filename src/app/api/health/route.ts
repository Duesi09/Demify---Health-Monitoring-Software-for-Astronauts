import { config, currentMission } from "@/lib/config";

/** Liveness/readiness probe used by the Docker HEALTHCHECK. */
export async function GET() {
  return Response.json({
    status: "ok",
    mission: currentMission().id,
    offline: config.offline,
    time: new Date().toISOString(),
  });
}
