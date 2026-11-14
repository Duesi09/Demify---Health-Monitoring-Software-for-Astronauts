import { z } from "zod";
import { askAssistant, QUESTION_MAX, QUESTION_MIN } from "@/lib/assistant/answer";
import { clientKey, takeAssistantBudget } from "@/lib/assistant/rate-limit";
import { isCrossOrigin, isJson } from "@/lib/http";
import { getCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_CHARS = 4096;

const Ask = z.object({
  question: z
    .string()
    .trim()
    .min(QUESTION_MIN, `question must be at least ${QUESTION_MIN} characters`)
    .max(QUESTION_MAX, `question must be at most ${QUESTION_MAX} characters`),
  crewId: z.string().trim().min(1).max(64).optional(),
});

/**
 * POST /api/assistant {question, crewId?} -> AssistantAnswer.
 * The onboard assistant answers from the local library only and cites it;
 * it advises and never decides. Same-origin and JSON like the other write
 * routes, but no admin token: asking is not a change. Rate limited per
 * client (12 questions a minute), because one question can keep the
 * language model busy for many seconds.
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403, headers: NO_STORE });
  if (!isJson(req)) return Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: NO_STORE });
  const retryAfter = takeAssistantBudget(clientKey(req));
  if (retryAfter > 0) {
    return Response.json(
      { error: "Too many questions; wait a moment and ask again" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
    );
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_CHARS) return Response.json({ error: "Body too large" }, { status: 413, headers: NO_STORE });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = Ask.safeParse(body);
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400, headers: NO_STORE });
  const { question, crewId } = parsed.data;
  if (crewId && !(await getCrew(crewId))) return Response.json({ error: "Unknown crewId" }, { status: 400, headers: NO_STORE });
  try {
    return Response.json(await askAssistant({ question, ...(crewId ? { crewId } : {}) }), { headers: NO_STORE });
  } catch (err) {
    console.error(`[demify] Onboard assistant failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The onboard assistant could not answer; try again" }, { status: 500, headers: NO_STORE });
  }
}
