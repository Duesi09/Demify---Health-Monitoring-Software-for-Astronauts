/**
 * In-memory rate limit of POST /api/assistant: a fixed one-minute window
 * per client, like the per-crew budget of POST /api/readings. One question
 * can keep the language model busy for many seconds, so the budget is small
 * (and answer.ts caps the chat calls running at once). In memory only, which
 * is enough for the single-process deployment.
 *
 * Who the client is: Next.js copies the socket address into
 * X-Forwarded-For only when the request has no such header
 * (`req.headers['x-forwarded-for'] ??= socket.remoteAddress` in
 * next/dist/server/base-server.js), and route handlers get no socket address
 * of their own (NextRequest.ip was removed in Next 15). So X-Forwarded-For
 * is whatever the client sent unless a reverse proxy in front of Demify
 * sets it. It is trusted only with DEMIFY_TRUST_PROXY=true (one proxy hop:
 * the rightmost address, the one the proxy appended); otherwise every
 * request counts against one shared budget ("direct"), which a client
 * cannot escape by sending a made-up header.
 */

export const ASSISTANT_RATE_LIMIT_PER_MIN = 12;
const WINDOW_MS = 60_000;
/** Windows kept before old ones are pruned. */
const MAX_CLIENTS = 1000;

const windows = new Map<string, { start: number; count: number }>();

/** DEMIFY_TRUST_PROXY=true: a reverse proxy in front of Demify sets X-Forwarded-For. */
export function trustProxy(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMIFY_TRUST_PROXY?.trim().toLowerCase() === "true";
}

/**
 * The client a request counts against: behind a trusted proxy the rightmost
 * X-Forwarded-For address (else X-Real-IP), otherwise "direct" (all direct
 * requests share one budget).
 */
export function clientKey(req: Request, trusted = trustProxy()): string {
  if (!trusted) return "direct";
  const forwarded = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .at(-1);
  const real = req.headers.get("x-real-ip")?.trim();
  return (forwarded || real || "direct").slice(0, 64);
}

/** Takes one request from the client's budget. Returns 0 when allowed, else the seconds to wait. */
export function takeAssistantBudget(key: string, now = Date.now(), limit = ASSISTANT_RATE_LIMIT_PER_MIN): number {
  if (windows.size > MAX_CLIENTS) {
    for (const [k, w] of windows) if (now - w.start >= WINDOW_MS) windows.delete(k);
  }
  let w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS || now < w.start) {
    w = { start: now, count: 0 };
    windows.set(key, w);
  }
  if (w.count >= limit) return Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000));
  w.count++;
  return 0;
}

/** Test helper. */
export function resetAssistantBudget(): void {
  windows.clear();
}

/**
 * Reads a request body of at most maxBytes. Returns null when the body is
 * larger: a Content-Length above the limit is refused before anything is
 * read, a body without one (chunked) is read only up to the limit.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
