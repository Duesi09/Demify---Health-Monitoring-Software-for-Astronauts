import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EscalationBanner, type EscalationItem } from "@/components/overview/escalation-banner";
import {
  alarmIdentity,
  alarmLevel,
  alarmLine,
  announce,
  EMPTY_TRACKER,
  FLAP_WINDOW_MS,
  formatCountdown,
  groupByCrew,
  isCrewPage,
  resumeTracker,
  serverStateKey,
  telemetryLabel,
  trackAlarms,
  type AlarmTracker,
} from "@/components/alarms/alarm-model";
import type { MonitorAlarm } from "@/lib/types";

function alarm(crewId: string, key: string, priority: MonitorAlarm["priority"], extra: Partial<MonitorAlarm> = {}): MonitorAlarm {
  return {
    id: `${crewId}:${key}`,
    crewId,
    crewName: crewId === "cdr" ? "Commander" : crewId === "ms1" ? "Mission Specialist 1" : crewId,
    priority,
    text: `${key.toUpperCase()} ${priority}`,
    drill: false,
    ...extra,
  };
}

/** Runs a sequence of polls (one per step, `stepMs` apart) and returns the fresh ids per poll. */
function run(polls: MonitorAlarm[][], stepMs = 2000, start: AlarmTracker | null = null) {
  let tracker = start;
  return polls.map((p, i) => {
    const r = trackAlarms(tracker, p, 1_000_000 + i * stepMs);
    tracker = r.tracker;
    return r.fresh.map(alarmIdentity);
  });
}

describe("trackAlarms: new alarm conditions", () => {
  it("treats every alarm of the first poll as new", () => {
    expect(run([[alarm("ms1", "hr", "medium"), alarm("cdr", "st", "high")]])[0]).toEqual([
      "ms1:hr#medium",
      "cdr:st#high",
    ]);
  });

  it("with an empty tracker (not first poll), only unseen alarms are new", () => {
    const r = trackAlarms(EMPTY_TRACKER, [alarm("ms1", "hr", "medium")], 0);
    expect(r.fresh).toHaveLength(1);
  });

  it("a continuously active alarm is new only once", () => {
    const a = alarm("ms1", "hr", "medium");
    expect(run([[a], [a], [a]])).toEqual([["ms1:hr#medium"], [], []]);
  });

  it("a different id is new", () => {
    const a = alarm("ms1", "hr", "medium");
    expect(run([[a], [a, alarm("ms1", "st", "high")]])[1]).toEqual(["ms1:st#high"]);
  });

  it("escalation medium -> high on the same id counts as new", () => {
    expect(run([[alarm("ms1", "hr", "medium")], [alarm("ms1", "hr", "high")]])[1]).toEqual(["ms1:hr#high"]);
  });

  it("de-escalation high -> medium is not new", () => {
    expect(run([[alarm("ms1", "hr", "high")], [alarm("ms1", "hr", "medium")]])[1]).toEqual([]);
  });

  it("flapping between medium and high within the window is new only on the first escalation", () => {
    const m = alarm("ms1", "hr", "medium");
    const h = alarm("ms1", "hr", "high");
    expect(run([[m], [h], [m], [h], [m]])).toEqual([["ms1:hr#medium"], ["ms1:hr#high"], [], [], []]);
  });
});

describe("trackAlarms: flapping debounce", () => {
  const hr = alarm("ms1", "hr", "medium");

  it("an id that disappears and reappears within 15 s is not new", () => {
    expect(run([[hr], [], [hr], [], [], [hr]])).toEqual([["ms1:hr#medium"], [], [], [], [], []]);
  });

  it("an id that comes back after more than 15 s is new again", () => {
    let tracker: AlarmTracker | null = null;
    tracker = trackAlarms(tracker, [hr], 0).tracker;
    tracker = trackAlarms(tracker, [], 2000).tracker;
    const back = trackAlarms(tracker, [hr], 2000 + FLAP_WINDOW_MS + 1);
    expect(back.fresh.map((a) => a.id)).toEqual(["ms1:hr"]);
  });

  it("the window is measured from the last time the alarm was seen, not first raised", () => {
    let tracker: AlarmTracker | null = null;
    for (let t = 0; t <= 60_000; t += 2000) tracker = trackAlarms(tracker, [hr], t).tracker;
    tracker = trackAlarms(tracker, [], 62_000).tracker;
    expect(trackAlarms(tracker, [hr], 70_000).fresh).toEqual([]);
  });

  it("a recent high alarm suppresses the same id returning at medium", () => {
    let tracker: AlarmTracker | null = null;
    tracker = trackAlarms(tracker, [alarm("ms1", "hr", "high")], 0).tracker;
    tracker = trackAlarms(tracker, [], 2000).tracker;
    expect(trackAlarms(tracker, [hr], 4000).fresh).toEqual([]);
  });

  it("forgets entries older than the window", () => {
    let tracker: AlarmTracker | null = null;
    tracker = trackAlarms(tracker, [hr], 0).tracker;
    tracker = trackAlarms(tracker, [], FLAP_WINDOW_MS + 1).tracker;
    expect(tracker.lastSeen.size).toBe(0);
  });
});

describe("resumeTracker", () => {
  it("keeps alarms active before a pause from counting as new afterwards", () => {
    const hr = alarm("ms1", "hr", "medium");
    let tracker: AlarmTracker | null = trackAlarms(null, [hr], 0).tracker;
    // Tab hidden for 5 minutes, then visible again.
    tracker = resumeTracker(tracker, 300_000);
    expect(trackAlarms(tracker, [hr], 300_100).fresh).toEqual([]);
  });

  it("does not hide alarms that were not active before the pause", () => {
    const tracker = resumeTracker(trackAlarms(null, [], 0).tracker, 300_000);
    expect(trackAlarms(tracker, [alarm("cdr", "st", "high")], 300_100).fresh).toHaveLength(1);
  });

  it("returns null for a null tracker (first poll still announces everything)", () => {
    expect(resumeTracker(null, 1)).toBeNull();
  });
});

describe("serverStateKey (router.refresh)", () => {
  const stemi = { crewId: "ms1", type: "stemi", startedAt: "2026-11-14T10:00:00.000Z" };

  it("is order independent", () => {
    const a = [alarm("ms1", "hr", "medium"), alarm("cdr", "st", "high")];
    expect(serverStateKey(a)).toBe(serverStateKey([...a].reverse()));
  });

  it("changes when a drill starts or ends on a crew member already in alarm", () => {
    const a = [alarm("ms1", "hr", "medium")];
    expect(serverStateKey(a, [stemi])).not.toBe(serverStateKey(a, []));
  });

  it("changes with the scenario type and start time", () => {
    const a = [alarm("ms1", "hr", "medium")];
    expect(serverStateKey(a, [stemi])).not.toBe(serverStateKey(a, [{ ...stemi, type: "vf" }]));
    expect(serverStateKey(a, [stemi])).not.toBe(serverStateKey(a, [{ ...stemi, startedAt: "2026-11-14T10:05:00.000Z" }]));
  });

  it("changes when a crew member's alarm level escalates", () => {
    expect(serverStateKey([alarm("ms1", "hr", "medium")])).not.toBe(
      serverStateKey([alarm("ms1", "hr", "medium"), alarm("ms1", "st", "high")]),
    );
  });

  it("does not change when an alarm flaps within the same level", () => {
    const st = alarm("ms1", "st", "high");
    expect(serverStateKey([st, alarm("ms1", "spo2", "high")])).toBe(serverStateKey([st]));
    expect(serverStateKey([alarm("ms1", "hr", "medium"), alarm("ms1", "resp", "medium")])).toBe(
      serverStateKey([alarm("ms1", "resp", "medium")]),
    );
  });

  it("changes when a crew member enters or leaves alarm", () => {
    expect(serverStateKey([])).not.toBe(serverStateKey([alarm("cdr", "hr", "medium")]));
  });
});

describe("display helpers", () => {
  it("alarmLevel picks the highest priority", () => {
    expect(alarmLevel([])).toBeNull();
    expect(alarmLevel([alarm("a", "x", "medium")])).toBe("medium");
    expect(alarmLevel([alarm("a", "x", "medium"), alarm("b", "y", "high")])).toBe("high");
  });

  it("alarmLine uses monitor priority marks and upper-case crew name", () => {
    expect(alarmLine(alarm("cdr", "st", "high", { text: "ST ELEVATION 3.1 mm" }))).toBe(
      "*** COMMANDER · ST ELEVATION 3.1 mm",
    );
    expect(alarmLine(alarm("ms1", "hr", "medium", { text: "HR HIGH 125 > 120" }))).toBe(
      "** MISSION SPECIALIST 1 · HR HIGH 125 > 120",
    );
  });

  it("groupByCrew puts high-priority crews and alarms first and flags drills", () => {
    const g = groupByCrew([
      alarm("ms1", "hr", "medium"),
      alarm("cdr", "hr", "medium", { drill: true }),
      alarm("cdr", "st", "high", { drill: true }),
    ]);
    expect(g.map((x) => x.crewId)).toEqual(["cdr", "ms1"]);
    expect(g[0]).toMatchObject({ level: "high", drill: true });
    expect(g[0].alarms[0].id).toBe("cdr:st");
    expect(g[1]).toMatchObject({ level: "medium", drill: false });
  });

  it("announce labels drills and is empty for no alarms", () => {
    expect(announce([])).toBe("");
    expect(announce([alarm("cdr", "st", "high", { text: "ST ELEVATION 3.1 mm", drill: true })])).toBe(
      "High priority alarm: Commander, ST ELEVATION 3.1 mm (training scenario, not a real emergency).",
    );
  });

  it("telemetryLabel marks simulated and mixed telemetry, not sensor data", () => {
    expect(telemetryLabel("simulated")).toBe("Simulated");
    expect(telemetryLabel("mixed")).toBe("Partly simulated");
    expect(telemetryLabel("sensor")).toBeNull();
    expect(telemetryLabel(undefined)).toBeNull();
  });

  it("formatCountdown rounds up and never goes negative", () => {
    expect(formatCountdown(120_000)).toBe("2:00");
    expect(formatCountdown(106_100)).toBe("1:47");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("isCrewPage matches the crew page and its sub-pages only", () => {
    expect(isCrewPage("/crew/cdr", "cdr")).toBe(true);
    expect(isCrewPage("/crew/cdr/record", "cdr")).toBe(true);
    expect(isCrewPage("/crew/cdr2", "cdr")).toBe(false);
    expect(isCrewPage("/crew", "cdr")).toBe(false);
    expect(isCrewPage(null, "cdr")).toBe(false);
  });
});

describe("EscalationBanner drill labelling", () => {
  const drillItem: EscalationItem = {
    crewId: "cdr",
    crewName: "Commander",
    role: "Commander",
    scenarioLabel: "Acute myocardial infarction (STEMI)",
    findings: [
      { indicator: "stDeviation", status: "critical", finding: "ST segment 2.7 mm: critical, act now.", drill: true },
    ],
  };
  const realItem: EscalationItem = {
    crewId: "plt",
    crewName: "Pilot",
    role: "Pilot",
    findings: [{ indicator: "systolicBP", status: "critical", finding: "Systolic BP 190 mmHg: critical, act now.", source: "manual" }],
  };
  const html = (items: EscalationItem[]) =>
    renderToStaticMarkup(createElement(EscalationBanner, { items, commDelaySeconds: 0.5 }));
  const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("frames a drill-only escalation as a training scenario, never a bare 'act now'", () => {
    const t = text(html([drillItem]));
    expect(t).toMatch(/Training scenario · drill/);
    expect(t).toMatch(/Drill: rehearse contacting the flight surgeon/);
    expect(t).toMatch(/Training scenario, not a real emergency/);
    expect(t).not.toMatch(/need(s)? medical review/);
    // The finding's "act now" is directly preceded by the DRILL tag.
    expect(t).toMatch(/Drill ST segment 2\.7 mm: critical, act now\./);
  });

  it("keeps the real escalation wording for real findings and tags the drill item", () => {
    const t = text(html([realItem, drillItem]));
    expect(t).toMatch(/Contact the flight surgeon: 2 crew members need medical review/);
    expect(t).toMatch(/Includes a drill/);
    expect(t).toMatch(/Drill ST segment/);
    expect(t).not.toMatch(/Drill Systolic BP/);
  });

  it("shows no drill label without a drill", () => {
    expect(text(html([realItem]))).not.toMatch(/drill/i);
  });
});
