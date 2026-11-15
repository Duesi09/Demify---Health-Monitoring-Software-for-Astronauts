import { describe, expect, it } from "vitest";
import { activeProtocol } from "@/components/crew/protocols";
import { PULSE_LOSS_STEPS, bubbleContent } from "@/components/onboard/assistant-bubble";
import { alarmEvents, EVENT_ACT_NOW } from "@/lib/assistant/alarm-events";
import { computeAlarms } from "@/lib/monitor/alarms";
import {
  PULSE_LOSS_ALARM_TEXT,
  PULSE_LOSS_HOLD_MS,
  PULSE_LOSS_MIN_MEASURED_S,
  pulseLoss,
} from "@/lib/monitor/pulse-loss";
import type { LiveVitals } from "@/lib/types";

/**
 * Phone pulse demo (training): a pulse measured for at least 10 s that then
 * stops raises the high-priority NO PULSE alarm, which opens the cardiac
 * arrest checklist and the assistant bubble.
 */

const FRESH = 2_500;
const T = Date.parse("2026-11-15T15:00:00.000Z");
/** One reading per second from `fromS` to `toS` seconds before T. */
function series(fromS: number, toS: number, bpm = 72) {
  const out: { takenAt: string; value: number }[] = [];
  for (let s = fromS; s >= toS; s--) out.push({ takenAt: new Date(T - s * 1000).toISOString(), value: bpm });
  return out;
}

describe("pulseLoss", () => {
  it("12 s measured, then 5 s silence: pulse lost", () => {
    const r = pulseLoss(series(17, 5, 74), T, FRESH);
    expect(r).toEqual({ lostAt: new Date(T - 5000).toISOString(), measuredS: 12, lastHr: 74 });
  });

  it("no alarm while the signal is live", () => {
    expect(pulseLoss(series(20, 1), T, FRESH)).toBeNull();
  });

  it("no alarm when less than 10 s were measured", () => {
    expect(pulseLoss(series(12, 5), T, FRESH)).toBeNull();
    expect(PULSE_LOSS_MIN_MEASURED_S).toBe(10);
  });

  it("only the last continuous measurement counts (a short touch after a long one does not alarm)", () => {
    const long = series(60, 40);
    const short = series(20, 15);
    expect(pulseLoss([...long, ...short], T, FRESH)).toBeNull();
  });

  it("ends after the hold time, and with no readings at all", () => {
    const old = series(20, 5).map((r) => ({ ...r, takenAt: new Date(Date.parse(r.takenAt) - PULSE_LOSS_HOLD_MS).toISOString() }));
    expect(pulseLoss(old, T, FRESH)).toBeNull();
    expect(pulseLoss([], T, FRESH)).toBeNull();
  });

  it("tolerates small gaps (the phone sends about once per second)", () => {
    const gappy = series(20, 5).filter((_, i) => i % 3 !== 1);
    expect(pulseLoss(gappy, T, FRESH)?.measuredS).toBe(15);
  });
});

function vitals(over: Partial<Omit<LiveVitals, "alarms">> = {}): Omit<LiveVitals, "alarms"> {
  return {
    crewId: "test",
    crewName: "Test Crew (phone)",
    t: new Date(T).toISOString(),
    hr: null,
    rhythm: "sinus",
    stMm: 0,
    pvcPerMin: 0,
    sys: null,
    dia: null,
    map: null,
    spo2: null,
    resp: null,
    temp: null,
    source: "none",
    activity: "rest",
    scenario: null,
    ...over,
  };
}

describe("NO PULSE alarm, checklist and bubble", () => {
  const lost = { lostAt: new Date(T - 5000).toISOString(), measuredS: 12, lastHr: 74 };

  it("raises a high-priority NO PULSE alarm only when the pulse was lost", () => {
    expect(computeAlarms(vitals())).toEqual([]);
    expect(computeAlarms(vitals({ pulseLost: lost }))).toMatchObject([
      { id: "test:nopulse", priority: "high", text: PULSE_LOSS_ALARM_TEXT, indicator: "heartRate", drill: false },
    ]);
  });

  it("opens the cardiac arrest checklist on the crew page", () => {
    const v = { ...vitals({ pulseLost: lost }), alarms: computeAlarms(vitals({ pulseLost: lost })) };
    expect(activeProtocol(v)?.id).toBe("vf");
  });

  it("the bubble shows the first checks and the flight-surgeon line (blackout-aware)", () => {
    const events = alarmEvents(computeAlarms(vitals({ pulseLost: lost })));
    const up = bubbleContent(events, false)!;
    expect(up.title).toBe("No pulse: possible cardiac arrest");
    expect(up.crewName).toBe("Test Crew (phone)");
    expect(up.steps.slice(0, 3)).toEqual([...PULSE_LOSS_STEPS]);
    expect(up.steps[3]).toMatch(/^Contact the flight surgeon/);
    const down = bubbleContent(events, true)!;
    expect(down.steps[3]).toMatch(/^No contact with the ground/);
    expect(down.steps.join(" ")).not.toMatch(/contact the flight surgeon/i);
  });

  it("other high alarms show the act-now line; medium alarms show no bubble", () => {
    const vf = alarmEvents([{ id: "ms1:vfib", crewId: "ms1", crewName: "Mission Specialist 1", priority: "high", text: "VFIB / NO PULSE", drill: false }]);
    expect(bubbleContent(vf, false)?.steps[0]).toBe(EVENT_ACT_NOW);
    const med = alarmEvents([{ id: "plt:abp", crewId: "plt", crewName: "Pilot", priority: "medium", text: "ABP SYS HIGH 167 > 160", drill: false }]);
    expect(bubbleContent(med, false)).toBeNull();
  });
});
