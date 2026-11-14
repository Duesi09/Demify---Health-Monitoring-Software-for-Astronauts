import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { actionUnderLink, buildProtocol, type ProtocolId } from "@/components/crew/protocols";
import { Findings } from "@/components/crew/findings";
import { EscalationBanner } from "@/components/overview/escalation-banner";
import { INDICATORS } from "@/lib/health/knowledge";
import { BLACKOUT_ESCALATION, CRITICAL_BAND_ESCALATION, LINK_PROFILES, findingUnderLink, linkPolicy } from "@/lib/link";
import type { Assessment, IndicatorId, MonitorAlarm } from "@/lib/types";

// The simulated ground-link switch stays up here (tests/ground-link-blackout.test.ts switches it down), so a
// ground-link.json left in data/ by a dev server cannot change these renders.
vi.mock("@/lib/onboard/ground-link", () => ({
  getGroundLink: async () => ({ up: true, switchedUp: true, forcedOffline: false, changedAt: new Date(0).toISOString(), backend: "file" }),
}));
// The check-in page reads crew and readings from the store; keep it in memory here.
vi.mock("@/lib/store/readings", () => ({
  listCrew: async () => [{ id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", baseline: { heartRate: 60 } }],
  listReadings: async () => [],
}));
vi.mock("@/app/check-in/actions", () => ({ submitCheckIn: async () => null }));

/**
 * Solar conjunction (blackout): there is no one to contact. No checklist
 * step, crew action or finding may tell the crew to contact the flight
 * surgeon, transmit "immediately" or act "under flight surgeon direction";
 * live and delayed links keep their wording.
 */

const BANNED = /immediately|contact the flight surgeon|flight surgeon direction/i;
const IDS = Object.keys(INDICATORS) as IndicatorId[];
const SCENARIOS: ProtocolId[] = ["stemi", "vf", "hypertensive-crisis", "stroke", "seizure", "general"];

const alarm = (indicator: IndicatorId): MonitorAlarm => ({
  id: `cdr:${indicator}`,
  crewId: "cdr",
  crewName: "Commander",
  priority: "high",
  text: `${indicator} alarm`,
  indicator,
  drill: false,
});

/** Every checklist the crew page can show: each scenario, and a general sheet for every indicator's alarm. */
function allProtocols(commDelaySeconds: number | null) {
  const opts = { commDelaySeconds, missionName: "Mars solar conjunction" };
  return [
    ...SCENARIOS.map((id) => buildProtocol(id, opts)),
    ...IDS.map((id) => buildProtocol("general", { ...opts, alarm: alarm(id) })),
  ];
}

const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("blackout checklists", () => {
  it("the conjunction profile is a blackout", () => {
    expect(linkPolicy(LINK_PROFILES.conjunction.oneWayS).mode).toBe("blackout");
  });

  it("no step tells the crew to contact the flight surgeon, act immediately or wait for flight surgeon direction", () => {
    for (const p of allProtocols(LINK_PROFILES.conjunction.oneWayS)) {
      expect(p.mode).toBe("blackout");
      for (const s of p.steps) {
        expect(s.text, `${p.id}/${s.id}`).not.toMatch(BANNED);
        if (s.detail) expect(s.detail, `${p.id}/${s.id} detail`).not.toMatch(BANNED);
      }
    }
  });

  it("the surgeon step says there is no contact", () => {
    for (const p of allProtocols(null)) {
      const surgeon = p.steps.find((s) => s.id === "surgeon");
      expect(surgeon, p.id).toBeDefined();
      expect(`${surgeon!.text} ${surgeon!.detail ?? ""}`, p.id).toMatch(/no contact/);
      expect(surgeon!.detail, p.id).toMatch(/transmit when contact returns/);
    }
  });

  it("rewrites the ECG and medication steps for the onboard procedures", () => {
    const stemi = buildProtocol("stemi", { commDelaySeconds: null, missionName: "Conjunction" });
    const by = (id: string) => stemi.steps.find((s) => s.id === id)!;
    expect(by("ecg").text).toBe("Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.");
    expect(by("checklist").detail).toBe("Any medication only per the onboard medical procedures.");
    const htn = buildProtocol("hypertensive-crisis", { commDelaySeconds: null, missionName: "Conjunction" });
    expect(htn.steps.find((s) => s.id === "checklist")!.text).toMatch(/medication only per the onboard medical procedures\.$/);
    const vf = buildProtocol("vf", { commDelaySeconds: null, missionName: "Conjunction" });
    expect(vf.steps.find((s) => s.id === "acls")!.text).toMatch(/^Follow the onboard advanced cardiac life support \(ACLS\) checklist as it directs/);
  });

  it("keeps the live and delayed wording unchanged", () => {
    for (const delay of [0.5, 750]) {
      const stemi = buildProtocol("stemi", { commDelaySeconds: delay, missionName: "Test" });
      expect(stemi.mode).not.toBe("blackout");
      const texts = stemi.steps.map((s) => s.text);
      expect(texts).toContain("Record and transmit a 12-lead ECG to the flight surgeon immediately.");
      expect(texts).toContain("Follow the onboard medical checklist for chest pain; contact the flight surgeon.");
      const vf = buildProtocol("vf", { commDelaySeconds: delay, missionName: "Test" }).steps.map((s) => s.text);
      expect(vf).toContain("Resume CPR immediately after each shock; switch compressors about every 2 minutes.");
      expect(vf).toContain("Follow the onboard advanced cardiac life support (ACLS) checklist under flight surgeon direction.");
      const htn = buildProtocol("hypertensive-crisis", { commDelaySeconds: delay, missionName: "Test" }).steps.map((s) => s.text);
      expect(htn).toContain("Follow the onboard medical checklist for high blood pressure; medication only per flight surgeon direction.");
    }
  });

  it("crew actions only change in a blackout", () => {
    for (const def of Object.values(INDICATORS)) {
      for (const a of def.actions) {
        expect(actionUnderLink(a, "live")).toBe(a);
        expect(actionUnderLink(a, "delayed")).toBe(a);
        expect(actionUnderLink(a, "blackout"), `${def.id}: ${a}`).not.toMatch(BANNED);
      }
    }
  });

  it("crew actions that need the ground wait until contact returns in a blackout", () => {
    const [family] = INDICATORS.mood.actions;
    const [, planning] = INDICATORS.stress.actions;
    const [, review] = INDICATORS.radiationCumulative.actions;
    expect(family).toBe("Schedule personal time and a call with family.");
    expect(planning).toBe("Raise workload concerns at the daily planning conference.");
    expect(review).toBe("Review planned high-exposure activities with ground.");
    expect(actionUnderLink(family, "blackout")).toBe("Schedule personal time and a call with family when contact returns.");
    expect(actionUnderLink(planning, "blackout")).toBe("Raise workload concerns at the daily planning conference when contact returns.");
    expect(actionUnderLink(review, "blackout")).toBe("Review planned high-exposure activities with ground when contact returns.");
    for (const a of [family, planning, review]) {
      expect(actionUnderLink(a, "live")).toBe(a);
      expect(actionUnderLink(a, "delayed")).toBe(a);
      // Applying it twice changes nothing more.
      expect(actionUnderLink(actionUnderLink(a, "blackout"), "blackout")).toBe(actionUnderLink(a, "blackout"));
    }
  });

  it("in a blackout no crew action asks for the ground without waiting for contact", () => {
    const GROUND = /\bwith ground\b|call with family|planning conference|flight surgeon/i;
    for (const def of Object.values(INDICATORS)) {
      for (const a of def.actions) {
        const b = actionUnderLink(a, "blackout");
        if (GROUND.test(b)) expect(b, `${def.id}: ${a}`).toMatch(/when contact returns/);
      }
    }
  });
});

describe("blackout findings", () => {
  it("finding texts drop 'contact the flight surgeon' for the onboard procedures", () => {
    const f = "Vision 1 /3: contact the flight surgeon.";
    expect(findingUnderLink(f, "live")).toBe(f);
    expect(findingUnderLink(f, "delayed")).toBe(f);
    expect(findingUnderLink(f, "blackout")).toBe(`Vision 1 /3: ${BLACKOUT_ESCALATION}.`);
    expect(findingUnderLink("Temperature 39.4 °C: critical: contact the flight surgeon.", "blackout")).not.toMatch(BANNED);
    // Mid-text (a NOAA note follows the radiation finding).
    const storm = "Dose rate 0.40 mSv/day: S2 solar radiation storm in progress: follow the storm shelter protocol, critical: contact the flight surgeon. Estimated from NOAA GOES proton flux.";
    expect(findingUnderLink(storm, "blackout")).not.toMatch(BANNED);
    expect(findingUnderLink(storm, "blackout")).toContain("Estimated from NOAA GOES proton flux.");
  });

  const vision: Assessment = {
    indicator: "visionChange",
    status: "caution",
    value: 1,
    unit: "/3",
    takenAt: "2026-11-15T15:00:00.000Z",
    finding: "Vision 1 /3: contact the flight surgeon.",
    actions: INDICATORS.visionChange.actions,
    escalate: true,
  };
  const st: Assessment = {
    indicator: "stDeviation",
    status: "critical",
    value: 1.5,
    unit: "mm",
    takenAt: "2026-11-15T15:00:00.000Z",
    finding: "ST segment 1.5 mm: critical: contact the flight surgeon.",
    actions: INDICATORS.stDeviation.actions,
    escalate: true,
  };
  const findings = (commDelaySeconds: number | null, source: "simulated" | "manual" = "simulated") =>
    text(
      renderToStaticMarkup(
        createElement(Findings, {
          assessments: [vision, st],
          sources: { visionChange: source, stDeviation: source },
          crewName: "Commander",
          commDelaySeconds,
          drill: false,
        }),
      ),
    );

  it("crew page callout: training framing on SIMULATED data, like the overview banner", () => {
    const live = findings(0.5);
    expect(live).toContain("Training: in a real mission this prompts a call to the flight surgeon.");
    expect(live).toContain("One-way signal delay 0.5 s.");
    expect(findings(0.5, "manual")).not.toContain("Training: in a real mission");
  });

  it("crew page in a blackout: criteria met, no contact, act onboard and transmit later", () => {
    const t = findings(null);
    // Training framing like the overview banner in a blackout.
    expect(t).toContain("Training: in a real mission this prompts the onboard procedures (no contact).");
    expect(t).not.toContain("this prompts a call to the flight surgeon");
    expect(t).toMatch(
      /2 findings meet the criteria to contact the flight surgeon for Commander: .*, but there is no contact with the ground \(blackout\): act on the onboard procedures and transmit when contact returns\./,
    );
    // Finding texts and crew actions in the list never say to contact anyone.
    const list = t.slice(t.indexOf("transmit when contact returns.") + 1);
    expect(list).not.toMatch(BANNED);
    expect(list).toContain(`Vision 1 /3: ${BLACKOUT_ESCALATION}.`);
    expect(list).toContain("Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.");
  });

  it("delayed link keeps the call wording in the training line", () => {
    expect(findings(750)).toContain("Training: in a real mission this prompts a call to the flight surgeon.");
  });

  it("the guidance links keep ?link=; without a choice they stay clean", () => {
    const render = (link: "conjunction" | null) =>
      renderToStaticMarkup(
        createElement(Findings, {
          assessments: [vision, st],
          sources: {},
          crewName: "Commander",
          commDelaySeconds: link ? null : 0.5,
          drill: false,
          link,
        }),
      );
    expect(render("conjunction")).toContain('href="/guidance?link=conjunction#ind-stDeviation"');
    const clean = render(null);
    expect(clean).toContain('href="/guidance#ind-stDeviation"');
    expect(clean).not.toContain("link=");
  });

  it("overview banner in a blackout: finding texts say no contact", () => {
    const html = renderToStaticMarkup(
      createElement(EscalationBanner, {
        items: [
          {
            crewId: "cdr",
            crewName: "Commander",
            role: "Commander",
            findings: [{ indicator: "visionChange", status: "caution", finding: vision.finding, source: "manual" }],
          },
        ],
        commDelaySeconds: null,
        link: "conjunction",
      }),
    );
    expect(text(html)).toContain(`Vision 1 /3: ${BLACKOUT_ESCALATION}.`);
    expect(text(html)).not.toMatch(/Vision 1 \/3: contact the flight surgeon/);
  });
});

describe("check-in legend follows ?link=", () => {
  async function checkIn(link?: string) {
    const { default: CheckInPage } = await import("@/app/check-in/page");
    const sp = link ? { crew: "ms2", link } : { crew: "ms2" };
    const props = { params: Promise.resolve({}), searchParams: Promise.resolve(sp) } as Parameters<typeof CheckInPage>[0];
    return text(renderToStaticMarkup(await CheckInPage(props)));
  }
  const legend = (t: string) => t.slice(t.indexOf("In the critical band"), t.indexOf("Ranges come from"));

  it("blackout: an escalation rule met, no contact, onboard procedures (like the field preview)", async () => {
    const l = legend(await checkIn("conjunction"));
    expect(l).toBe(
      "In the critical band: re-check and log. Escalation only when Demify shows an escalation rule met; with no contact (blackout) act on the onboard procedures and transmit when contact returns. Training: in a real mission this prompts the onboard procedures; transmit when contact returns. ",
    );
    expect(l).toBe(`In the critical band: re-check and log. ${CRITICAL_BAND_ESCALATION.blackout} `);
    expect(l).not.toMatch(BANNED);
  });

  it("live and delayed keep “contact the flight surgeon” with the training framing", async () => {
    for (const link of ["iss", "mars-transit"]) {
      expect(legend(await checkIn(link))).toContain(
        "Escalation only when Demify shows “contact the flight surgeon”. Training: in a real mission this prompts a call to the flight surgeon.",
      );
    }
  });
});
