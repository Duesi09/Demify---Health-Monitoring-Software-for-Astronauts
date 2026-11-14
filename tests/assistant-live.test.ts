import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onboardConfig, type OnboardConfig } from "@onboard/config.mjs";
import type { LiveVitals, MonitorAlarm } from "@/lib/types";

/**
 * The assistant as a live consultant: when Demify raises an alarm (a
 * monitor alarm or a training drill), the assistant responds with the
 * matching checklist passages at once (fixed query, no model call) and a
 * walk-through by the local language model afterwards, once per alarm.
 * The live vitals, the ground link and the model client are mocked; the
 * bundled library (library/) is searched for real.
 */

const mocks = vi.hoisted(() => ({
  link: { up: true },
  live: [] as unknown[],
  chat: vi.fn(),
  modelStatus: vi.fn(),
}));

vi.mock("@onboard/model.mjs", () => ({
  chat: mocks.chat,
  embed: vi.fn(),
  modelStatus: mocks.modelStatus,
  ModelError: class extends Error {},
}));
vi.mock("@/lib/onboard/ground-link", () => ({
  isGroundLinkUp: async () => mocks.link.up,
  getGroundLink: async () => ({ up: mocks.link.up, switchedUp: mocks.link.up, forcedOffline: false, changedAt: new Date(0).toISOString(), backend: "file" }),
}));
vi.mock("@/lib/monitor/live", () => ({ getAllLiveVitals: async () => mocks.live, getLiveVitals: async () => null }));
vi.mock("@/lib/store/readings", async () => {
  const { DEFAULT_CREW } = await import("@/lib/store/readings-json");
  return { listCrew: async () => DEFAULT_CREW, getCrew: async (id: string) => DEFAULT_CREW.find((c) => c.id === id) };
});

import {
  ALARM_PANEL_ID,
  BLACKOUT_STEP_NOTE,
  DRILL_TAG,
  EVENT_ACT_NOW,
  NAV_ALERT_LABEL,
  alarmEvents,
  alarmWords,
  eventQueries,
  flightSurgeonLine,
  hasGuidanceAlarm,
  walkthroughQuestion,
} from "@/lib/assistant/alarm-events";
import { alarmGuidance, alarmWalkthrough, resetAlarmGuidance } from "@/lib/assistant/alarm-guidance";
import { resetAssistantState } from "@/lib/assistant/answer";
import { resetLibrarySourceState } from "@/lib/assistant/library-source";
import { resetAssistantBudget } from "@/lib/assistant/rate-limit";
import { PASSAGES_ONLY_REASON } from "@/lib/assistant/wording";
import { BLACKOUT_ADVICE } from "@/lib/link";
import { NavAlarmBadge } from "@/components/onboard/nav-alarm-badge";
import { alarmLevelOf, alarmsKey } from "@/components/onboard/use-active-alarms";

const ROOT = path.resolve(import.meta.dirname, "..");
const STEMI_LABEL = "Acute myocardial infarction (STEMI)";
const STARTED = "2026-11-14T18:00:00.000Z";

function alarm(crewId: string, kind: string, priority: MonitorAlarm["priority"], text: string, drill = false, crewName = crewId.toUpperCase()): MonitorAlarm {
  return { id: `${crewId}:${kind}`, crewId, crewName, priority, text, drill };
}

function live(crewId: string, alarms: MonitorAlarm[], scenario?: { type: string; label: string }): LiveVitals {
  return {
    crewId,
    crewName: alarms[0]?.crewName ?? crewId,
    alarms,
    scenario: scenario ? { crewId, type: scenario.type, startedAt: STARTED, elapsedS: 30, label: scenario.label } : null,
  } as unknown as LiveVitals;
}

const stemiDrill = () =>
  live(
    "ms2",
    [
      alarm("ms2", "st", "high", "ST ELEVATION 3.1 mm", true, "Mission specialist 2"),
      alarm("ms2", "hr", "medium", "HR HIGH 124 > 120", true, "Mission specialist 2"),
    ],
    { type: "stemi", label: STEMI_LABEL },
  );

let dataDir: string;
const withModel = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir, DEMIFY_MODEL_URL: "http://model.test/v1", DEMIFY_LLM_MODEL: "gemma3:4b" });
const laptop = (): OnboardConfig => onboardConfig({ DEMIFY_DATA_DIR: dataDir });
const READY = { reachable: true, available: ["gemma3:4b"], llmReady: true, embedReady: false };
const WALK = "Stop all activity and keep the crew member at rest, monitored [1]. Record and transmit a 12-lead ECG to the flight surgeon [1].";

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-live-"));
  resetLibrarySourceState();
  resetAssistantState();
  resetAlarmGuidance();
  resetAssistantBudget();
  mocks.link.up = true;
  mocks.live = [];
  mocks.chat.mockReset();
  mocks.modelStatus.mockReset();
  mocks.modelStatus.mockResolvedValue(READY);
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("alarm events (pure)", () => {
  it("makes one event per crew member in alarm, high priority first, drills labelled by their scenario", () => {
    const events = alarmEvents(
      [
        alarm("cdr", "spo2", "medium", "SpO2 LOW 90 < 92"),
        alarm("ms2", "hr", "medium", "HR HIGH 124 > 120", true),
        alarm("ms2", "st", "high", "ST ELEVATION 3.1 mm", true),
      ],
      [{ crewId: "ms2", type: "stemi", startedAt: STARTED, label: STEMI_LABEL }],
    );
    expect(events.map((e) => e.crewId)).toEqual(["ms2", "cdr"]);
    expect(events[0]).toMatchObject({ level: "high", drill: true, title: STEMI_LABEL, key: `ms2|drill|stemi|${STARTED}` });
    expect(events[0].alarms.map((a) => a.priority)).toEqual(["high", "medium"]);
    expect(events[1]).toMatchObject({ level: "medium", drill: false, title: "SpO2 LOW 90 < 92", key: "cdr|alarm|spo2", scenario: null });
  });

  it("keeps a drill's key while its alarms change, so one walk-through serves the whole drill", () => {
    const sc = [{ crewId: "ms2", type: "stemi", startedAt: STARTED, label: STEMI_LABEL }];
    const a = alarmEvents([alarm("ms2", "st", "high", "ST ELEVATION 1.6 mm", true)], sc);
    const b = alarmEvents([alarm("ms2", "st", "high", "ST ELEVATION 3.2 mm", true), alarm("ms2", "pvc", "medium", "PVCs 8/min", true)], sc);
    expect(a[0].key).toBe(b[0].key);
  });

  it("works for scenario and alarm types it has never seen (labels as Demify shows them)", () => {
    const events = alarmEvents(
      [alarm("plt", "report", "high", "Stroke signs reported (F.A.S.T.)", true)],
      [{ crewId: "plt", type: "stroke", startedAt: STARTED, label: "Stroke signs reported (F.A.S.T.)" }],
    );
    expect(events[0].title).toBe("Stroke signs reported (F.A.S.T.)");
    expect(eventQueries(events[0])[0]).toBe("Stroke signs reported (F.A.S.T.) checklist");
    const unknown = alarmEvents([alarm("fe", "xyz", "high", "NEW ALARM 12 > 10")]);
    expect(eventQueries(unknown[0])).toEqual(["NEW ALARM alarm checklist", "NEW ALARM alarm", "high-priority alarm checklist"]);
  });

  it("builds fixed queries from labels only (values and limits left out)", () => {
    expect(alarmWords("SpO2 LOW 90 < 92")).toBe("SpO2 LOW");
    expect(alarmWords("HR HIGH 132 > 120")).toBe("HR HIGH");
    expect(alarmWords("ST ELEVATION 3.1 mm")).toBe("ST ELEVATION");
    expect(alarmWords("PVCs 6/min")).toBe("PVCs");
    expect(alarmWords("VFIB / NO PULSE")).toBe("VFIB NO PULSE");
    expect(alarmWords("RESP 4 ≤ 4")).toBe("RESP");
  });

  it("shows the nav '!' for any high- or medium-priority alarm", () => {
    expect(hasGuidanceAlarm([])).toBe(false);
    expect(hasGuidanceAlarm([{ priority: "medium" }])).toBe(true);
    expect(alarmLevelOf(null)).toBeNull();
    expect(alarmLevelOf([{ priority: "medium" }, { priority: "high" }])).toBe("high");
    expect(alarmLevelOf([{ priority: "medium" }])).toBe("medium");
    // The shared store only re-renders when an alarm or a scenario changes.
    const a = [alarm("ms2", "st", "high", "ST ELEVATION 3.1 mm")];
    expect(alarmsKey(a, [])).toBe(alarmsKey([...a], []));
    expect(alarmsKey(a, [])).not.toBe(alarmsKey([alarm("ms2", "st", "medium", "ST ELEVATION 3.1 mm")], []));
  });

  it("says what to do now, with the blackout wording when there is no contact", () => {
    expect(EVENT_ACT_NOW).toBe("Start the checklist now and alert the crew. Do not wait for the assistant.");
    expect(flightSurgeonLine(false)).toBe("Contact the flight surgeon and report: time of onset, rhythm, vital signs, actions taken.");
    expect(flightSurgeonLine(true)).toContain(BLACKOUT_ADVICE);
    expect(flightSurgeonLine(true)).toMatch(/^No contact with the ground: .*Prepare the report for the flight surgeon/);
    expect(DRILL_TAG).toBe("Training scenario (drill)");
    expect(BLACKOUT_STEP_NOTE).toBe(
      "No contact with the ground: wherever a step says to contact or transmit to the flight surgeon, prepare the report instead and transmit it when contact returns.",
    );
  });

  it("asks the model a fixed question without values, crew names or anything to copy", () => {
    const [e] = alarmEvents([alarm("ms2", "st", "high", "ST ELEVATION 3.1 mm", true, "Mission specialist 2")], [
      { crewId: "ms2", type: "stemi", startedAt: STARTED, label: STEMI_LABEL },
    ]);
    const q = walkthroughQuestion(e);
    expect(q).toBe(`Alarm: "${STEMI_LABEL}" (training drill). Walk the crew through the response checklist for this alarm, step by step.`);
    expect(q).not.toMatch(/\d|Mission specialist/);
    expect(walkthroughQuestion(e, true)).toBe(
      `Alarm: "${STEMI_LABEL}" (training drill). The ground link is down (no contact): ${BLACKOUT_ADVICE}. Walk the crew through the response checklist for this alarm, step by step.`,
    );
  });
});

describe("instant guidance (GET /api/assistant/event)", () => {
  it("answers a STEMI drill with the STEMI checklist at once, without calling the model", async () => {
    mocks.live = [stemiDrill(), live("cdr", [])];
    const r = await alarmGuidance(null, withModel());
    expect(r.events).toHaveLength(1);
    const g = r.events[0];
    expect(g.event).toMatchObject({ crewId: "ms2", drill: true, title: STEMI_LABEL });
    expect(g.query).toBe(`${STEMI_LABEL} checklist`);
    expect(g.citations.length).toBeGreaterThan(0);
    expect(g.citations[0]).toMatchObject({ docId: "alarm-response", n: 1 });
    expect(g.citations[0].heading).toMatch(/STEMI/);
    expect(g.citations.every((c) => c.version.length === 64 && c.sha256.length === 64)).toBe(true);
    expect(g.freshness.libraryAgeText).toMatch(/^bundled with this release/);
    expect(g.retrieval).toBe("bundled");
    expect(g.walkthrough).toBeNull();
    expect(r.blackout).toBe(false);
    expect(r.model).toEqual({ ready: true, name: "gemma3:4b" });
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("answers VF and a hypertensive crisis with their checklists, and a real alarm by its text", async () => {
    mocks.live = [
      live("plt", [alarm("plt", "vfib", "high", "VFIB / NO PULSE", true)], { type: "vf", label: "Cardiac arrest (ventricular fibrillation)" }),
      live("cdr", [alarm("cdr", "abp", "high", "ABP SYS 196 > 180", true)], { type: "hypertensive-crisis", label: "Hypertensive crisis" }),
      live("fe", [alarm("fe", "vfib", "high", "VFIB / NO PULSE")]),
    ];
    const r = await alarmGuidance(null, laptop());
    const by = Object.fromEntries(r.events.map((g) => [g.event.crewId, g]));
    expect(by.plt.citations[0].heading).toMatch(/ventricular fibrillation/i);
    expect(by.cdr.citations[0].heading).toMatch(/Hypertensive crisis/);
    expect(by.fe.event.drill).toBe(false);
    expect(by.fe.query).toBe("VFIB NO PULSE alarm checklist");
    expect(by.fe.citations[0].docId).toBe("alarm-response");
    expect(r.model.ready).toBe(false);
    expect(r.model.reason).toBe(PASSAGES_ONLY_REASON.notConfigured);
  });

  it("reports the blackout: ground-link switch down, or ?link=conjunction, and adds the library's blackout procedure", async () => {
    mocks.live = [stemiDrill()];
    const up = await alarmGuidance(null, laptop());
    expect(up.events[0].citations.some((c) => c.docId === "ground-link-blackout")).toBe(false);
    const conj = await alarmGuidance("conjunction", laptop());
    expect(conj.blackout).toBe(true);
    const last = conj.events[0].citations.at(-1);
    expect(last?.heading).toBe("Ground link blackout › Handling a medical event during a blackout");
    expect(last?.text).toContain("transmit when contact returns");
    expect(conj.events[0].citations.map((c) => c.n)).toEqual(conj.events[0].citations.map((_, i) => i + 1));
    mocks.link.up = false;
    expect((await alarmGuidance(null, laptop())).blackout).toBe(true);
  });

  it("has no events while no alarm is active", async () => {
    mocks.live = [live("ms2", [])];
    expect((await alarmGuidance(null, laptop())).events).toEqual([]);
  });
});

describe("walk-through (POST /api/assistant/event)", () => {
  const key = `ms2|drill|stemi|${STARTED}`;

  it("asks the model once per alarm and reuses the walk-through (also while it runs)", async () => {
    mocks.live = [stemiDrill()];
    let resolve!: (v: string) => void;
    mocks.chat.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const a = alarmWalkthrough(key, null, withModel());
    const b = alarmWalkthrough(key, null, withModel());
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledTimes(1));
    resolve(WALK);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.kind === "walkthrough" && ra.walkthrough.status).toBe("answered");
    expect(rb.kind === "walkthrough" && rb.walkthrough.answer).toBe(ra.kind === "walkthrough" ? ra.walkthrough.answer : "x");
    const again = await alarmWalkthrough(key, null, withModel());
    expect(again.kind === "walkthrough" && again.started).toBe(false);
    expect(mocks.chat).toHaveBeenCalledTimes(1);

    // The finished walk-through comes with the instant guidance from now on, without a model call.
    const g = await alarmGuidance(null, withModel());
    expect(g.events[0].walkthrough?.answer).toContain("[1]");
    expect(g.events[0].walkthrough?.groundLink).toBe("up");

    // The prompt: the fixed question, the checklist passages, the ground link.
    const [, messages] = mocks.chat.mock.calls[0] as [unknown, { role: string; content: string }[]];
    expect(messages[1].content).toContain(`Alarm: "${STEMI_LABEL}" (training drill)`);
    expect(messages[1].content).toContain("[1] Alarm response drill checklists");
    expect(messages[1].content).toContain("Ground link status: up.");
  });

  it("writes a separate walk-through for the blackout (no contact)", async () => {
    mocks.live = [stemiDrill()];
    mocks.chat.mockResolvedValue(WALK);
    await alarmWalkthrough(key, null, withModel());
    const r = await alarmWalkthrough(key, "conjunction", withModel());
    expect(r.kind === "walkthrough" && r.walkthrough.groundLink).toBe("down");
    expect(mocks.chat).toHaveBeenCalledTimes(2);
    const [, messages] = mocks.chat.mock.calls[1] as [unknown, { role: string; content: string }[]];
    expect(messages[1].content).toContain("Ground link status: down (blackout)");
    expect(messages[1].content).toContain("The ground link is down (no contact)");
  });

  it("passes every answer check: a dose or an uncited answer is not shown", async () => {
    mocks.live = [stemiDrill()];
    mocks.chat.mockResolvedValue("Give 300 mg now [1].");
    const r = await alarmWalkthrough(key, null, withModel());
    expect(r.kind === "walkthrough" && r.walkthrough).toMatchObject({ status: "passages-only", answer: null, reason: PASSAGES_ONLY_REASON.dose });
  });

  it("runs one walk-through at a time; another alarm waits (busy, not kept)", async () => {
    mocks.live = [stemiDrill(), live("plt", [alarm("plt", "vfib", "high", "VFIB / NO PULSE")])];
    let resolve!: (v: string) => void;
    mocks.chat.mockReturnValueOnce(new Promise<string>((r) => (resolve = r)));
    const first = alarmWalkthrough(key, null, withModel());
    await vi.waitFor(() => expect(mocks.chat).toHaveBeenCalledTimes(1));
    const second = await alarmWalkthrough("plt|alarm|vfib", null, withModel());
    expect(second.kind === "walkthrough" && second.walkthrough.status).toBe("busy");
    resolve(WALK);
    await first;
    mocks.chat.mockResolvedValueOnce("Start chest compressions now [1].");
    const retry = await alarmWalkthrough("plt|alarm|vfib", null, withModel());
    expect(retry.kind === "walkthrough" && retry.walkthrough.status).toBe("answered");
  });

  it("without a model: no walk-through, the reason, and nothing kept (a model started later is used)", async () => {
    mocks.live = [stemiDrill()];
    mocks.modelStatus.mockResolvedValue({ reachable: false, available: [], llmReady: false, embedReady: false, error: "ECONNREFUSED" });
    const r = await alarmWalkthrough(key, null, withModel());
    expect(r.kind === "walkthrough" && r.walkthrough).toMatchObject({ status: "passages-only", reason: PASSAGES_ONLY_REASON.unreachable });
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("says when the alarm has ended", async () => {
    mocks.live = [live("ms2", [])];
    expect(await alarmWalkthrough(key, null, withModel())).toEqual({ kind: "ended" });
  });
});

describe("routes", () => {
  const route = () => import("@/app/api/assistant/event/route");
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost:3000/api/assistant/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", ...headers },
      body: JSON.stringify(body),
    });

  it("GET lists the events; POST is same-origin JSON and answers 409 for an alarm that ended", async () => {
    mocks.live = [stemiDrill()];
    const { GET, POST } = await route();
    const res = await GET(new Request("http://localhost:3000/api/assistant/event?link=conjunction"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { event: { key: string } }[]; blackout: boolean };
    expect(body.events[0].event.key).toBe(`ms2|drill|stemi|${STARTED}`);
    expect(body.blackout).toBe(true);

    expect((await POST(post({ key: "x|alarm|y" }, { origin: "http://evil.test" }))).status).toBe(403);
    expect((await POST(new Request("http://localhost:3000/api/assistant/event", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await POST(post({ key: "" }))).status).toBe(400);
    expect((await POST(post({ key: "ms2|alarm|gone" }))).status).toBe(409);
  });
});

describe("nav badge and wording", () => {
  it("renders a squared '!' with its accessible name; flashes ~1.5 Hz, solid with reduced motion", () => {
    const html = renderToStaticMarkup(createElement(NavAlarmBadge));
    expect(html).toContain(`role="img"`);
    expect(html).toContain(`aria-label="${NAV_ALERT_LABEL}"`);
    expect(NAV_ALERT_LABEL).toBe("Active alarm: the assistant has guidance");
    const css = readFileSync(path.join(ROOT, "src/components/onboard/nav-alarm-badge.css"), "utf8");
    expect(css).toMatch(/animation: nav-alarm-flash 0\.66s/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
    expect(css).toMatch(/border-radius: 3px/);
    expect(ALARM_PANEL_ID).toBe("alarm-guidance");
  });

  it("the nav item opens /assistant with the panel and keeps ?link=; the alarm bar links there too", () => {
    const nav = readFileSync(path.join(ROOT, "src/components/app-nav.tsx"), "utf8");
    expect(nav).toMatch(/withLink\(href, link\)\}#\$\{ALARM_PANEL_ID\}/);
    const bar = readFileSync(path.join(ROOT, "src/components/alarms/alarm-center.tsx"), "utf8");
    expect(bar).toContain("Open the assistant");
  });

  it("never claims the assistant detects or recognises anything", () => {
    const files = [
      "src/lib/assistant/alarm-events.ts",
      "src/lib/assistant/alarm-guidance.ts",
      "src/lib/assistant/german.ts",
      "src/app/api/assistant/event/route.ts",
      "src/components/onboard/alarm-guidance-panel.tsx",
      "src/components/onboard/nav-alarm-badge.tsx",
      "src/components/onboard/use-active-alarms.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      expect(src, f).not.toMatch(/\bdetect(s|ed|ing)?\b|\brecogni[sz](e|es|ed|ing)\b|\binternet\b|AI[\s-]+powered|decision[\s-]+support/i);
    }
  });
});

describe("walk-through text", () => {
  it("drops the model's uncited lead-in line, nothing else", async () => {
    const { dropLeadIn } = await import("@/lib/assistant/alarm-guidance");
    const lead = "Here’s the response to the crew’s question, based on the library passages:\n\n1. Stop all activity [1].\n2. Record an ECG [1].";
    expect(dropLeadIn(lead)).toBe("1. Stop all activity [1].\n2. Record an ECG [1].");
    expect(dropLeadIn("Stop all activity [1].\nRecord an ECG [1].")).toBe("Stop all activity [1].\nRecord an ECG [1].");
    expect(dropLeadIn("The checklist [1] says:\n1. Rest [1].")).toBe("The checklist [1] says:\n1. Rest [1].");
    expect(dropLeadIn("Steps:\nno citation here")).toBe("Steps:\nno citation here");
    // A lead-in that mentions the passages, or starts with "Here", goes even when it carries markers.
    expect(dropLeadIn("Here are the steps from the drill checklist [1]:\n1. Rest [1].")).toBe("1. Rest [1].");
    expect(dropLeadIn("Based on passages [1] and [2], the crew should:\n- Rest [1].\n- Record an ECG [2].")).toBe("- Rest [1].\n- Record an ECG [2].");
    expect(dropLeadIn("According to passage [1]:\n1. Rest [1].")).toBe("1. Rest [1].");
    // Not a lead-in: no colon at the end.
    expect(dropLeadIn("Here the crew rests [1].\n1. Rest [1].")).toBe("Here the crew rests [1].\n1. Rest [1].");
  });
});
