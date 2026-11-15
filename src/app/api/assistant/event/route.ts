import { z } from "zod";
import { alarmGuidance, alarmWalkthrough } from "@/lib/assistant/alarm-guidance";
import { clientKey, readBodyLimited, takeAssistantBudget } from "@/lib/assistant/rate-limit";
import { isCrossOrigin, isJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 2048;

/**
 * GET /api/assistant/event?link= -> AlarmGuidanceResponse.
 * The assistant's response to the alarms Demify raised: per crew member in
 * alarm (high priority first) the matching checklist passages from the
 * library, found at once with a fixed query (no model call), plus a
 * finished walk-through when there is one. ?link= is the page's signal
 * delay profile (conjunction = no contact). Read-only.
 */
export async function GET(req: Request) {
  const link = new URL(req.url).searchParams.get("link");
  try {
    return Response.json(await alarmGuidance(link), { headers: NO_STORE });
  } catch (err) {
    console.error(`[demify] Alarm guidance failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The assistant could not read the alarms; try again" }, { status: 500, headers: NO_STORE });
  }
}

const Walk = z.object({
  key: z.string().trim().min(3).max(300),
  link: z.string().trim().max(32).optional(),
});

/**
 * POST /api/assistant/event {key, link?} -> {walkthrough: AlarmWalkthrough}.
 * The local language model's walk-through of an active alarm's checklist
 * passages. One model call per alarm and link mode: a running or finished
 * walk-through is shared. 409 when the alarm is no longer active. Same
 * origin and JSON like POST /api/assistant; a new model call counts
 * against the same per-client question budget (429 when spent).
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403, headers: NO_STORE });
  if (!isJson(req)) return Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: NO_STORE });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return Response.json({ error: "Body too large" }, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    const text = await readBodyLimited(req, MAX_BODY_BYTES);
    if (text === null) return Response.json({ error: "Body too large" }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = Walk.safeParse(body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400, headers: NO_STORE });

  let retryAfter = 0;
  const who = clientKey(req);
  try {
    const r = await alarmWalkthrough(parsed.data.key, parsed.data.link ?? null, undefined, {
      mayStart: () => {
        retryAfter = takeAssistantBudget(who);
        return retryAfter === 0;
      },
    });
    if (r.kind === "ended") return Response.json({ error: "This alarm is no longer active" }, { status: 409, headers: NO_STORE });
    if (r.kind === "limited") {
      return Response.json(
        { error: "Too many questions; wait a moment" },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
      );
    }
    return Response.json({ walkthrough: r.walkthrough }, { headers: NO_STORE });
  } catch (err) {
    console.error(`[demify] Alarm walk-through failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The assistant could not prepare a walk-through; the checklist passages stand" }, { status: 500, headers: NO_STORE });
  }
}
