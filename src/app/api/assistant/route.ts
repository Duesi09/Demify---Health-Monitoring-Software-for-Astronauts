import { z } from "zod";
import { askAssistant, AssistantBusyError, QUESTION_MAX, QUESTION_MIN } from "@/lib/assistant/answer";
import { clientKey, readBodyLimited, takeAssistantBudget } from "@/lib/assistant/rate-limit";
import { ASSISTANT_BUSY } from "@/lib/assistant/wording";
import { isCrossOrigin, isJson } from "@/lib/http";
import { getCrew } from "@/lib/store/readings";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
/** Largest request body read, in bytes (a 500-character question plus JSON fits easily). */
const MAX_BODY_BYTES = 4096;
/** Seconds a busy client is asked to wait. */
const BUSY_RETRY_AFTER_S = 5;

const Ask = z.object({
  question: z
    .string()
    .trim()
    .min(QUESTION_MIN, `question must be at least ${QUESTION_MIN} characters`)
    .max(QUESTION_MAX, `question must be at most ${QUESTION_MAX} characters`),
  crewId: z.string().trim().min(1).max(64).optional(),
});

const tooLarge = () => Response.json({ error: "Body too large" }, { status: 413, headers: NO_STORE });

/**
 * POST /api/assistant {question, crewId?} -> AssistantAnswer.
 * The onboard assistant answers from the local library only and cites it;
 * it advises and never decides. Same-origin and JSON like the other write
 * routes, but no admin token: asking is not a change. Bodies over 4 KB are
 * refused (413) before they are read. Rate limited (12 questions a minute
 * per client, see rate-limit.ts for who counts as a client), and 503 while
 * the language model already answers MAX_CONCURRENT_CHATS questions.
 */
export async function POST(req: Request) {
  if (isCrossOrigin(req)) return Response.json({ error: "Cross-origin requests are not allowed" }, { status: 403, headers: NO_STORE });
  if (!isJson(req)) return Response.json({ error: "Content-Type must be application/json" }, { status: 415, headers: NO_STORE });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge();
  const retryAfter = takeAssistantBudget(clientKey(req));
  if (retryAfter > 0) {
    return Response.json(
      { error: "Too many questions; wait a moment and ask again" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
    );
  }
  let body: unknown;
  try {
    const text = await readBodyLimited(req, MAX_BODY_BYTES);
    if (text === null) return tooLarge();
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
    if (err instanceof AssistantBusyError) {
      return Response.json(
        { error: ASSISTANT_BUSY },
        { status: 503, headers: { ...NO_STORE, "Retry-After": String(BUSY_RETRY_AFTER_S) } },
      );
    }
    console.error(`[demify] Onboard assistant failed: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The onboard assistant could not answer; try again" }, { status: 500, headers: NO_STORE });
  }
}
