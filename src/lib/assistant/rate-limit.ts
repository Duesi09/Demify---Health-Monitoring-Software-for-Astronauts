/**
 * In-memory rate limit of POST /api/assistant: a fixed one-minute window
 * per client, like the per-crew budget of POST /api/readings. One question
 * can keep the language model busy for many seconds, so the budget is small.
 * In memory only, which is enough for the single-process deployment.
 */

export const ASSISTANT_RATE_LIMIT_PER_MIN = 12;
const WINDOW_MS = 60_000;
/** Windows kept before old ones are pruned. */
const MAX_CLIENTS = 1000;

const windows = new Map<string, { start: number; count: number }>();

/**
 * The client a request counts against: the leftmost X-Forwarded-For address,
 * else X-Real-IP, else "local" (direct requests on the station network
 * share one budget).
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return (forwarded || real || "local").slice(0, 64);
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
