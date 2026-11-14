import "server-only";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import { modelStatus } from "@onboard/model.mjs";
import { getGroundLink } from "../onboard/ground-link";
import type { OnboardStatus } from "../onboard/types";
import { libraryStatus } from "./library-source";

/** How long GET /api/onboard/status waits for the model server's model list. */
const MODEL_STATUS_TIMEOUT_MS = 2500;

/** The model part of the status: ready / missing-models / unreachable / not-configured. Never throws. */
export async function modelState(cfg: OnboardConfig = onboardConfig()): Promise<OnboardStatus["model"]> {
  const base = { url: cfg.modelUrl ?? null, llm: cfg.llmModel, embed: cfg.embedModel };
  if (!cfg.modelUrl) return { state: "not-configured", ...base, available: [] };
  const s = await modelStatus(cfg, MODEL_STATUS_TIMEOUT_MS);
  if (!s.reachable) return { state: "unreachable", ...base, available: [] };
  return { state: s.llmReady && s.embedReady ? "ready" : "missing-models", ...base, available: s.available };
}

/** GET /api/onboard/status. Never throws. */
export async function onboardStatus(cfg: OnboardConfig = onboardConfig()): Promise<OnboardStatus> {
  const [lib, model, groundLink] = await Promise.all([libraryStatus(cfg), modelState(cfg), getGroundLink()]);
  return {
    database: lib.database,
    model,
    groundLink,
    library: lib.library,
    syncIntervalHours: cfg.syncIntervalHours,
  };
}
