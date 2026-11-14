import { config, currentMission } from "@/lib/config";
import { getGroundLink, lastKnownGroundLink } from "@/lib/onboard/ground-link";

export const dynamic = "force-dynamic";

/** The health probe answers within this, whatever the database does. */
const CHECK_BUDGET_MS = 2_000;

/** Resolves to `fallback()` when `work` has not settled (or rejected) within ms. */
function within<T>(work: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback()), ms);
  });
  return Promise.race([work.catch(fallback), late]).finally(() => clearTimeout(timer));
}

/** Without DATABASE_URL the PostgreSQL driver is never loaded. Never throws. */
async function databaseStatus(): Promise<"connected" | "unreachable" | "not-configured"> {
  if (!process.env.DATABASE_URL?.trim()) return "not-configured";
  try {
    const { pingDatabase } = await import("@onboard/db.mjs");
    return (await pingDatabase(undefined, CHECK_BUDGET_MS)) ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

/**
 * Liveness/readiness probe used by the Docker HEALTHCHECK. Stays 200 when
 * PostgreSQL is unreachable: the app keeps working on its JSON file store
 * (degraded), which `database` reports. The database ping and the ground link
 * read are each raced against 2 s, so a frozen database never hangs the probe
 * (the ground link then comes from its last known position).
 */
export async function GET() {
  const [database, link] = await Promise.all([
    within(databaseStatus(), CHECK_BUDGET_MS, () => "unreachable" as const),
    within(getGroundLink(), CHECK_BUDGET_MS, lastKnownGroundLink),
  ]);
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
