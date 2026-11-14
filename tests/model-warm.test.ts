import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@onboard/model.mjs", () => ({ chat: vi.fn(async () => "OK") }));
import { chat } from "@onboard/model.mjs";
import { resetWarmState, warmModel } from "@/lib/assistant/warm";
import { onboardConfig } from "@onboard/config.mjs";

const cfg = onboardConfig({ DEMIFY_MODEL_URL: "http://127.0.0.1:11434/v1", DEMIFY_LLM_MODEL: "gemma3:4b" });

describe("warmModel", () => {
  afterEach(() => {
    resetWarmState();
    vi.mocked(chat).mockClear();
    vi.unstubAllEnvs();
  });
  it("sends one tiny request at most every 4 minutes", async () => {
    expect(warmModel(cfg, 1_000_000)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warmModel(cfg, 1_000_000 + 60_000)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(warmModel(cfg, 1_000_000 + 4 * 60_000 + 1)).toBe(true);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(vi.mocked(chat).mock.calls[0][2]).toMatchObject({ maxTokens: 1 });
  });
  it("does nothing without a model or when turned off", () => {
    expect(warmModel(onboardConfig({}), 1)).toBe(false);
    vi.stubEnv("DEMIFY_MODEL_KEEP_WARM", "false");
    expect(warmModel(cfg, 1)).toBe(false);
    expect(chat).not.toHaveBeenCalled();
  });
});
