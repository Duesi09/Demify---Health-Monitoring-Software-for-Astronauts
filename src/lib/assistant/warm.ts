import "server-only";
import type { OnboardConfig } from "@onboard/config.mjs";
import { chat } from "@onboard/model.mjs";

/**
 * Keeps the local model loaded. Ollama unloads a model after 5 idle minutes,
 * and the next answer then waits for it to load again (seconds on a laptop).
 * Every status check (assistant and library pages, the nav) calls warmModel();
 * at most once every 4 minutes it sends a one-token request in the
 * background. DEMIFY_MODEL_KEEP_WARM=false turns it off (e.g. on battery).
 */
const WARM_EVERY_MS = 4 * 60_000;
const g = globalThis as unknown as { __demifyWarm?: { at: number; busy: boolean } };

export function warmModel(cfg: OnboardConfig, now = Date.now()): boolean {
  if (!cfg.modelUrl || process.env.DEMIFY_MODEL_KEEP_WARM?.trim().toLowerCase() === "false") return false;
  const s = (g.__demifyWarm ??= { at: 0, busy: false });
  if (s.busy || now - s.at < WARM_EVERY_MS) return false;
  s.busy = true;
  s.at = now;
  void chat(cfg, [{ role: "user", content: "Reply with OK." }], { temperature: 0, maxTokens: 1 })
    .catch(() => {})
    .finally(() => {
      s.busy = false;
    });
  return true;
}

/** Test helper. */
export function resetWarmState(): void {
  g.__demifyWarm = undefined;
}
