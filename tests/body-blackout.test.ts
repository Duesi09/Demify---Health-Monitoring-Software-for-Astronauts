import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EscalationItem } from "@/components/overview/escalation-banner";
import type { CrewAssessment } from "@/lib/health/assess";
import type { Assessment, BodyRegionId, Status } from "@/lib/types";

/**
 * Body map under the signal-delay link (?link=). In a blackout (solar
 * conjunction) there is no one to contact: the region panel says the
 * escalation rule is met with no contact, finding texts and crew actions
 * follow the onboard procedures, and nothing says "contact the flight
 * surgeon" or "immediately". Live and delayed links keep their wording, and
 * links inside the page keep ?link=.
 */

const fixture = vi.hoisted(() => ({ all: [] as CrewAssessment[] }));
vi.mock("@/lib/health/assess", () => ({ assessAllCrew: async () => fixture.all }));

const { BODY_REGIONS, INDICATORS } = await import("@/lib/health/knowledge");
const { RegionDetail } = await import("@/components/body/region-detail");
const { BodyMap } = await import("@/components/body/body-map");
const { EscalationBanner } = await import("@/components/overview/escalation-banner");
const { CrewCard } = await import("@/components/overview/crew-card");
const { AlarmDecisionDiagram } = await import("@/components/help/diagrams");
const { Findings } = await import("@/components/crew/findings");
const { BLACKOUT_ESCALATION, LINK_PROFILES } = await import("@/lib/link");

const BANNED = /immediately|contact the flight surgeon|flight surgeon direction/i;
/** Visible text of rendered markup (tags dropped, the entities React escapes decoded). */
const text = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

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
const hr: Assessment = {
  indicator: "heartRate",
  status: "caution",
  value: 112,
  unit: "bpm",
  takenAt: "2026-11-15T15:00:00.000Z",
  finding: "Resting heart rate 112 bpm: above the normal range.",
  actions: INDICATORS.heartRate.actions,
  escalate: false,
};
const mood: Assessment = {
  indicator: "mood",
  status: "critical",
  value: 2,
  unit: "/10",
  takenAt: "2026-11-15T08:00:00.000Z",
  finding: "Mood 2 /10: critical, 2 days in a row: contact the flight surgeon.",
  actions: INDICATORS.mood.actions,
  escalate: true,
};

const regions = Object.fromEntries(Object.keys(BODY_REGIONS).map((id) => [id, "nominal"])) as Record<BodyRegionId, Status>;
regions.heart = "critical";
regions.brain = "critical";

const crewAssessment: CrewAssessment = {
  crew: { id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", baseline: { heartRate: 60 } },
  overall: "critical",
  assessments: [hr, st, mood],
  regions,
  escalations: [st, mood],
  sources: { heartRate: "simulated", stDeviation: "simulated", mood: "manual" },
  scenario: null,
};

const byId = { heartRate: hr, stDeviation: st, mood };
const sources = crewAssessment.sources;

function region(region: BodyRegionId, linkMode: "live" | "delayed" | "blackout", link: "conjunction" | "mars-transit" | null = null) {
  return renderToStaticMarkup(
    createElement(RegionDetail, { region, status: regions[region], assessments: byId, sources, crewName: "Mission Specialist 2", linkMode, link }),
  );
}

describe("body map region panel follows the link", () => {
  it("blackout: escalation rule met with no contact, onboard procedures, nothing to contact", () => {
    const html = region("heart", "blackout", "conjunction");
    const t = text(html);
    expect(t).toContain("Escalation rule met: no contact (blackout)");
    expect(t).toContain("Act on the onboard procedures; transmit when contact returns.");
    expect(t).not.toMatch(BANNED);
    expect(t).not.toContain("do not wait for a reply");
    // Finding text and the ECG / chest-pain crew actions are rewritten for the blackout.
    expect(t).toContain(`ST segment 1.5 mm: critical: ${BLACKOUT_ESCALATION}.`);
    expect(t).toContain("Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.");
    expect(t).toContain("Follow the onboard medical checklist for chest pain.");
    // The escalation criteria are shown, link-neutral.
    expect(t).toContain(INDICATORS.stDeviation.escalation);
    // Links inside the page keep ?link=.
    expect(html).toContain('href="/guidance?link=conjunction#ind-stDeviation"');
  });

  it("blackout: the mood criteria do not ask for anything 'now'", () => {
    const t = text(region("brain", "blackout", "conjunction"));
    expect(t).toContain("Escalation rule met: no contact (blackout)");
    expect(t).not.toMatch(BANNED);
    const criteria = t.slice(t.indexOf("Mood:"), t.indexOf("Act on the onboard procedures"));
    expect(criteria).toContain(INDICATORS.mood.escalation);
    expect(criteria).not.toMatch(/\bnow\b/i);
  });

  it("live and delayed keep their wording", () => {
    for (const mode of ["live", "delayed"] as const) {
      const t = text(region("heart", mode));
      expect(t).toContain("Contact the flight surgeon");
      expect(t).toContain("Start the crew actions below now; do not wait for a reply if the comm delay is long.");
      expect(t).toContain(st.finding);
      expect(t).toContain("Record and transmit a 12-lead ECG to the flight surgeon immediately.");
      expect(t).not.toContain("no contact (blackout)");
    }
    expect(region("heart", "live")).toContain('href="/guidance#ind-stDeviation"');
  });

  it("the whole body map (client component) passes the link mode to the panel", () => {
    const html = renderToStaticMarkup(
      createElement(BodyMap, {
        crewName: "Mission Specialist 2",
        regions,
        assessments: crewAssessment.assessments,
        sources,
        initialRegion: "heart",
        linkMode: "blackout",
        link: "conjunction",
      }),
    );
    expect(text(html)).toContain("Escalation rule met: no contact (blackout)");
    expect(text(html)).not.toMatch(BANNED);
  });
});

describe("/body reads ?link=", () => {
  async function body(sp: Record<string, string>) {
    fixture.all = [crewAssessment];
    const { default: BodyPage } = await import("@/app/body/page");
    const props = { params: Promise.resolve({}), searchParams: Promise.resolve(sp) } as Parameters<typeof BodyPage>[0];
    return renderToStaticMarkup(await BodyPage(props));
  }

  it("/body?link=conjunction shows the blackout wording and keeps ?link= in its links", async () => {
    const html = await body({ crew: "ms2", region: "heart", link: "conjunction" });
    const t = text(html);
    expect(t).toContain("Signal delay profile Conjunction: no contact (blackout); act on the onboard procedures and transmit when contact returns.");
    expect(t).toContain("Escalation rule met: no contact (blackout)");
    expect(t).not.toMatch(BANNED);
    expect(html).toContain('href="/body?crew=ms2&amp;link=conjunction"');
    expect(html).toContain('href="/guidance?link=conjunction#ind-stDeviation"');
  });

  it("an explicit delayed link keeps the contact wording and the parameter", async () => {
    const html = await body({ crew: "ms2", region: "heart", link: "mars-transit" });
    const t = text(html);
    expect(t).toContain("Signal delay profile Mars (transit): 12.5 min one way.");
    expect(t).toContain("Contact the flight surgeon");
    expect(html).toContain('href="/body?crew=ms2&amp;link=mars-transit"');
  });

  it("without ?link= the links stay clean", async () => {
    const html = await body({ crew: "ms2", region: "heart" });
    expect(html).toContain('href="/body?crew=ms2"');
    expect(html).not.toContain("link=");
  });
});

describe("overview links to the body map keep ?link=", () => {
  const item: EscalationItem = {
    crewId: "ms2",
    crewName: "Mission Specialist 2",
    role: "Flight Engineer",
    findings: [
      { indicator: "stDeviation", status: "critical", finding: st.finding, source: "manual" },
      { indicator: "mood", status: "critical", finding: mood.finding, source: "manual" },
    ],
  };
  const banner = (commDelaySeconds: number | null, items: EscalationItem[] = [item]) =>
    renderToStaticMarkup(createElement(EscalationBanner, { items, commDelaySeconds, link: commDelaySeconds == null ? "conjunction" : null }));

  it("escalation banner and crew card", () => {
    expect(banner(null)).toContain('href="/body?crew=ms2&amp;link=conjunction"');
    expect(banner(0.5)).toContain('href="/body?crew=ms2"');
    const card = renderToStaticMarkup(
      createElement(CrewCard, { id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", overall: "critical", regions, findings: [], link: "conjunction" }),
    );
    expect(card).toContain('href="/body?crew=ms2&amp;link=conjunction"');
    expect(card).toContain('href="/crew/ms2?link=conjunction"');
    expect(card).toContain('href="/check-in?crew=ms2&amp;link=conjunction"');
  });

  it("blackout banner: 'Escalate when' never says now or contact the flight surgeon", () => {
    const t = text(banner(null));
    const escalateWhen = t.split("Escalate when:").slice(1).map((s) => s.split(/\(SIMULATED|Escalate when:|$/)[0]);
    expect(escalateWhen).toHaveLength(2);
    for (const e of escalateWhen) {
      expect(e).not.toMatch(BANNED);
      expect(e).not.toMatch(/\bnow\b/i);
    }
    expect(t).toContain(INDICATORS.stDeviation.escalation);
    expect(t).toContain(INDICATORS.mood.escalation);
  });

  it("drill heading: blackout rehearses the onboard procedures; live keeps the flight surgeon", () => {
    const drill: EscalationItem[] = [
      { ...item, scenarioLabel: "Heart attack (STEMI)", findings: item.findings.map((f) => ({ ...f, drill: true })) },
    ];
    const blackout = text(banner(null, drill));
    expect(blackout).toContain("Drill: rehearse the onboard procedures (no contact) for 1 crew member");
    expect(blackout).not.toContain("rehearse contacting the flight surgeon");
    expect(text(banner(0.5, drill))).toContain("Drill: rehearse contacting the flight surgeon for 1 crew member");
  });

  it("training heading (SIMULATED data) in a blackout: the onboard procedures, not a call", () => {
    const sim: EscalationItem[] = [{ ...item, findings: item.findings.map((f) => ({ ...f, source: "simulated" as const })) }];
    expect(text(banner(null, sim))).toContain("Training: in a real mission this prompts the onboard procedures (no contact)");
    expect(text(banner(0.5, sim))).toContain("Training: in a real mission this prompts a call to the flight surgeon");
  });
});

describe("help diagram caption", () => {
  const caption = (mode: "live" | "delayed" | "blackout", delayText: string, missionName: string) =>
    text(renderToStaticMarkup(createElement(AlarmDecisionDiagram, { missionName, delayText, mode })));

  it("blackout: names the link once, without nested parentheses", () => {
    const t = caption("blackout", "no contact (blackout)", "Conjunction");
    expect(t).toContain("Contact rule for Conjunction: no contact: act on the onboard procedures; transmit when contact returns.");
    expect(t).not.toMatch(/\([^()]*\(/);
    // Once in the caption and once in the SVG label: never twice in one sentence.
    expect(t).not.toMatch(/no contact[^.]*no contact/);
  });

  it("live and delayed keep the delay in parentheses", () => {
    expect(caption("live", "0.5 s one-way", "ISS")).toContain("Contact rule for ISS (0.5 s one-way): near real-time link: call directly.");
    expect(caption("delayed", "12.5 min one-way", "Mars (transit)")).toContain(
      "Contact rule for Mars (transit) (12.5 min one-way): act first, then transmit the data.",
    );
  });
});

describe("crew page findings: met escalation rules first, like the overview cards", () => {
  it("an escalating caution comes before a critical value without an escalation", () => {
    const critNoEsc: Assessment = { ...hr, indicator: "glucose", status: "critical", finding: "Glucose 300 mg/dL: critical band.", escalate: false };
    const vision: Assessment = { ...hr, indicator: "visionChange", status: "caution", finding: "Vision 1 /3: contact the flight surgeon.", escalate: true };
    const t = text(
      renderToStaticMarkup(
        createElement(Findings, {
          assessments: [critNoEsc, vision],
          sources: {},
          crewName: "Mission Specialist 2",
          commDelaySeconds: LINK_PROFILES.iss.oneWayS,
          drill: false,
        }),
      ),
    );
    expect(t.indexOf("Vision 1 /3")).toBeGreaterThan(-1);
    expect(t.indexOf("Vision 1 /3")).toBeLessThan(t.indexOf("Glucose 300 mg/dL"));
  });
});
