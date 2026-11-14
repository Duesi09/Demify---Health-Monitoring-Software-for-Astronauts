import { config, currentMission } from "@/lib/config";
import { getGroundLink } from "@/lib/onboard/ground-link";

export const dynamic = "force-dynamic";

/** Without DATABASE_URL the PostgreSQL driver is never loaded. Never throws. */
async function databaseStatus(): Promise<"connected" | "unreachable" | "not-configured"> {
  if (!process.env.DATABASE_URL?.trim()) return "not-configured";
  try {
    const { pingDatabase } = await import("@onboard/db.mjs");
    return (await pingDatabase(undefined, 2000)) ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

/**
 * Liveness/readiness probe used by the Docker HEALTHCHECK. Stays 200 when
 * PostgreSQL is unreachable: the app keeps working on its JSON file store
 * (degraded), which `database` reports.
 */
export async function GET() {
  const [database, link] = await Promise.all([databaseStatus(), getGroundLink()]);
  return Response.json(
    {
      status: "ok",
      mission: currentMission().id,
      offline: config.offline,
      database,
      groundLink: { up: link.up, forcedOffline: link.forcedOffline },
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
