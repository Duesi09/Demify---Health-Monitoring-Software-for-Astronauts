import { describe, expect, it } from "vitest";
import { simulateDaily, simulateSeries } from "@/lib/sources/simulator";
import type { CrewMember } from "@/lib/types";

const crew: CrewMember = { id: "cdr", name: "Commander", role: "Commander", baseline: { heartRate: 62 } };

describe("demo telemetry", () => {
  it("is deterministic and always labelled simulated", () => {
    const from = Date.UTC(2026, 0, 1, 0, 0);
    const to = from + 6 * 3_600_000;
    const a = simulateSeries(crew, from, to);
    const b = simulateSeries(crew, from, to);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((r) => r.source === "simulated")).toBe(true);
  });

  it("keeps vitals physiologically plausible", () => {
    const from = Date.UTC(2026, 0, 1);
    const rs = simulateSeries(crew, from, from + 24 * 3_600_000);
    for (const r of rs.filter((x) => x.indicator === "heartRate")) {
      expect(r.value).toBeGreaterThan(35);
      expect(r.value).toBeLessThan(160);
    }
    for (const r of rs.filter((x) => x.indicator === "spo2")) expect(r.value).toBeLessThanOrEqual(100);
  });

  it("clamps self-report scales to 1-10", () => {
    const from = Date.UTC(2026, 0, 1);
    const rs = simulateDaily(crew, from, from + 14 * 86_400_000);
    for (const r of rs.filter((x) => x.indicator === "mood" || x.indicator === "stress")) {
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(10);
    }
  });
});
