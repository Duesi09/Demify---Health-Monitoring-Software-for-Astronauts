import { z } from "zod";
import { config } from "@/lib/config";
import { simulatesTelemetry } from "@/lib/crew-mode";
import { isCrossOrigin, isJson, requireAdmin } from "@/lib/http";
import { INDICATORS } from "@/lib/health/knowledge";
import { addReadings, getCrew, listReadings } from "@/lib/store/readings";
import { simulateDaily, simulateLive, simulateSeries } from "@/lib/sources/simulator";
import { getScenario } from "@/lib/store/scenarios";
import { isStorableText } from "@/lib/store/text";
import type { IndicatorId } from "@/lib/types";

export const dynamic = "force-dynamic";

const INDICATOR_IDS = Object.keys(INDICATORS) as [IndicatorId, ...IndicatorId[]];

/** Allowed clock skew for device timestamps. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** 500 readings x ~700 B fits well under this. */
const MAX_BODY_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 600;

/**
 * Strings are rejected (400), not silently changed, when they hold a NUL
 * character or an unpaired UTF-16 surrogate: PostgreSQL cannot store either,
 * and a crew note should reach the record exactly as it was written. The
 * PostgreSQL store still cleans every string it inserts (other writers,
 * spooled or legacy files), see src/lib/store/text.ts.
 */
const storable = (field: string) =>
  z.string().refine(isStorableText, {
    message: `${field} must not contain NUL characters (U+0000) or unpaired UTF-16 surrogates`,
  });

const ReadingIn = z
  .object({
    crewId: storable("crewId").min(1).max(64),
    indicator: z.enum(INDICATOR_IDS),
    value: z.number().finite(),
    unit: storable("unit").max(16),
    takenAt: z.iso
      .datetime()
      .refine((t) => Date.parse(t) <= Date.now() + MAX_FUTURE_SKEW_MS, {
        message: "takenAt must not be in the future",
      })
      .optional(),
    source: z.enum(["manual", "sensor"]).default("manual"),
    note: storable("note").max(500).optional(),
  })
  .superRefine((r, ctx) => {
    const def = INDICATORS[r.indicator];
    const [lo, hi] = def.inputRange;
    if (r.value < lo || r.value > hi) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${def.short} must be between ${lo} and ${hi} ${def.unit}`,
      });
    }
    if (r.unit !== def.unit) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: `unit for ${r.indicator} must be "${def.unit}"`,
      });
    }
  });
const Batch = z.array(ReadingIn).min(1).max(500);

const Hours = z.coerce.number().catch(24);

/**
 * Per-crew ingestion budget (fixed one-minute window). In memory only, which
 * is enough for the single-process deployment; it bounds how fast any client
 * can fill the store and evict genuine history.
 */
const rateWindows = new Map<string, { start: number; count: number }>();

function rateLimit(): number {
  const n = Number(process.env.DEMIFY_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RATE_LIMIT;
}

/** Returns seconds to wait if the batch would exceed a crew budget, else 0 and records it. */
function takeRateBudget(counts: Map<string, number>, now = Date.now()): number {
  const limit = rateLimit();
  let retryAfter = 0;
  for (const [crewId, n] of counts) {
    let w = rateWindows.get(crewId);
    if (!w || now - w.start >= RATE_WINDOW_MS) w = { start: now, count: 0 };
    if (w.count + n > limit) {
      retryAfter = Math.max(retryAfter, Math.ceil((w.start + RATE_WINDOW_MS - now) / 1000));
    }
  }
  if (retryAfter > 0) return retryAfter;
  for (const [crewId, n] of counts) {
    let w = rateWindows.get(crewId);
    if (!w || now - w.start >= RATE_WINDOW_MS) {
      w = { start: now, count: 0 };
      rateWindows.set(crewId, w);
    }
    w.count += n;
  }
  return 0;
}

class BodyTooLarge extends Error {}

/** Reads the body with a byte cap, so chunked uploads without Content-Length are bounded too. */
async function readBodyCapped(req: Request, max: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * GET /api/readings?crewId=cdr&indicator=heartRate&hours=24
 * Returns stored readings (manual + sensor) merged with simulated telemetry
 * when DEMIFY_SIMULATE is on.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const crewId = url.searchParams.get("crewId") ?? undefined;
  const indicator = (url.searchParams.get("indicator") ?? undefined) as IndicatorId | undefined;
  const hoursParam = url.searchParams.get("hours")?.trim();
  // Fallback 24 h for missing/garbage input; clamp to 1 h .. 30 days.
  const hours = Math.min(24 * 30, Math.max(1, hoursParam ? Hours.parse(hoursParam) : 24));
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const stored = await listReadings({ crewId, indicator, since });
  let simulated: Awaited<ReturnType<typeof simulateSeries>> = [];
  const scenario = crewId ? await getScenario(crewId) : null;
  if ((config.simulateTelemetry || scenario) && crewId) {
    const crew = await getCrew(crewId);
    if (crew && (simulatesTelemetry(crew) || scenario)) {
      const from = Date.parse(since);
      const now = Date.now();
      simulated = [
        ...(simulatesTelemetry(crew)
          ? [...simulateSeries(crew, Math.max(from, now - 48 * 3_600_000)), ...simulateDaily(crew, from)]
          : []),
        ...simulateLive(crew, now, scenario),
      ].filter(
        (r) => !indicator || r.indicator === indicator,
      );
    }
  }
  const readings = [...simulated, ...stored].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  return Response.json({ readings });
}

/**
 * POST /api/readings — manual check-ins and device ingestion.
 * Body: one reading or an array (max 500). Example:
 *   {"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"}
 * Needs the admin token (x-demify-admin header or unlock cookie) when
 * DEMIFY_ADMIN_TOKEN is set (see requireAdmin).
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) {
    return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!isJson(req)) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json({ error: "Request body too large (max 1 MB)" }, { status: 413 });
  }
  let json: unknown;
  try {
    json = JSON.parse(await readBodyCapped(req, MAX_BODY_BYTES));
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return Response.json({ error: "Request body too large (max 1 MB)" }, { status: 413 });
    }
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Accept a single reading or a batch; validate as a batch for clear errors.
  const parsed = Batch.safeParse(Array.isArray(json) ? json : [json]);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const items = parsed.data;
  for (const r of items) {
    if (!(await getCrew(r.crewId))) {
      return Response.json({ error: `Unknown crewId ${r.crewId}` }, { status: 400 });
    }
  }
  const perCrew = new Map<string, number>();
  for (const r of items) perCrew.set(r.crewId, (perCrew.get(r.crewId) ?? 0) + 1);
  const retryAfter = takeRateBudget(perCrew);
  if (retryAfter > 0) {
    return Response.json(
      { error: "Too many readings for this crew member; slow down" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  const now = new Date().toISOString();
  const created = await addReadings(items.map((r) => ({ ...r, takenAt: r.takenAt ?? now })));
  return Response.json({ created }, { status: 201 });
}
