import { describe, expect, it } from "vitest";
import { buildCrewTrends, niceAxis, nominalBand } from "@/components/overview/trends-data";
import { classify } from "@/lib/health/knowledge";
import type { IndicatorId, Reading } from "@/lib/types";

const NOW = Date.parse("2026-11-14T13:20:00Z");
const H = 3_600_000;

function r(
  crewId: string,
  indicator: IndicatorId,
  value: number,
  t: number,
  extra: Partial<Reading> = {},
): Reading {
  return {
    id: `${crewId}-${indicator}-${t}-${value}`,
    crewId,
    indicator,
    value,
    unit: "",
    takenAt: new Date(t).toISOString(),
    source: "simulated",
    ...extra,
  };
}

const crew = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
];

describe("nominalBand", () => {
  it("matches classify() at both edges", () => {
    for (const id of ["heartRate", "systolicBP", "spo2", "sleepHours", "stress"] as IndicatorId[]) {
      const band = nominalBand(id);
      expect(band, id).not.toBeNull();
      expect(classify(id, band!.from), `${id} from`).toBe("nominal");
      expect(classify(id, band!.to), `${id} to`).toBe("nominal");
    }
    expect(nominalBand("heartRate")).toEqual({ from: 50, to: 100 });
    expect(nominalBand("sleepHours")).toEqual({ from: 7, to: 10 });
    expect(nominalBand("stress")?.to).toBe(4);
  });
});

describe("niceAxis", () => {
  it("returns round ticks inside a padded, clamped domain", () => {
    const { domain, ticks } = niceAxis(45, 100, 0, [25, 220]);
    expect(domain[0]).toBeLessThan(45);
    expect(domain[1]).toBeGreaterThan(100);
    expect(ticks.every((t) => t % 10 === 0)).toBe(true);
    const spo2 = niceAxis(95, 100, 0, [50, 100]);
    expect(spo2.domain[1]).toBe(100);
  });
});

describe("buildCrewTrends", () => {
  it("downsamples 24 h vitals to hourly medians and skips exercise for resting HR", () => {
    const hourStart = Math.floor(NOW / H) * H;
    const data = buildCrewTrends(
      crew,
      {
        a: [
          r("a", "heartRate", 60, hourStart + 60_000),
          r("a", "heartRate", 64, hourStart + 120_000),
          r("a", "heartRate", 62, hourStart + 180_000),
          r("a", "heartRate", 150, hourStart + 240_000, { note: "exercise" }),
          r("a", "heartRate", 140, hourStart + 300_000, { note: "scenario:stemi" }),
          r("a", "heartRate", 99, NOW + 3 * H), // future-dated: ignored
        ],
        b: [],
      },
      NOW,
    );
    const hr = data.charts.find((c) => c.id === "rhr")!;
    expect(hr.rows).toHaveLength(24);
    const last = hr.rows[hr.rows.length - 1];
    expect(last.v.a).toBe(62);
    expect(last.v.b).toBeNull();
    expect(data.allSimulated).toBe(true);
    expect(data.hasData).toBe(true);
  });

  it("keeps one value per day for 7 days and prefers crew entries over simulated ones", () => {
    const day = Math.floor(NOW / 86_400_000) * 86_400_000;
    const data = buildCrewTrends(
      crew,
      {
        a: [
          r("a", "sleepHours", 7.3, day + 6.5 * H),
          r("a", "sleepHours", 5.5, day + 6 * H, { source: "manual" }),
          r("a", "sleepHours", 8, day - 86_400_000 + 6.5 * H),
          r("a", "sleepHours", 4, day - 9 * 86_400_000), // outside the window
        ],
        b: [],
      },
      NOW,
    );
    const sleep = data.charts.find((c) => c.id === "sleep")!;
    expect(sleep.rows).toHaveLength(7);
    expect(sleep.rows[6].v.a).toBe(5.5);
    expect(sleep.rows[6].real).toEqual(["a"]);
    expect(sleep.rows[5].v.a).toBe(8);
    expect(data.allSimulated).toBe(false);
  });

  it("reports no data honestly", () => {
    const data = buildCrewTrends(crew, { a: [], b: [] }, NOW);
    expect(data.hasData).toBe(false);
    expect(data.charts).toHaveLength(5);
  });
});
