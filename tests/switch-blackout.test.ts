import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ONE blackout: while the simulated ground-link switch is down
 * (GroundLinkState.switchedUp false), every page that reads ?link= behaves
 * exactly as under ?link=conjunction (no contact, act on the onboard
 * procedures, transmit when contact returns), named "Ground link down
 * (simulated blackout)". DEMIFY_OFFLINE alone is not a blackout. With the
 * switch up nothing changes. The selected ?link= stays in the links either
 * way, and the signal-delay selector says the ground link is down.
 */

const PITCH = new Date("2026-11-15T15:30:00Z");

// Isolated, empty data directory (no crew entries, no drills from the dev DB), as in pitch-time.test.ts.
const dataDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  return mkdtempSync(path.join(tmpdir(), "demify-switch-"));
});

vi.mock("@/lib/config", async (orig) => {
  const actual = await orig<typeof import("@/lib/config")>();
  return {
    ...actual,
    config: { ...actual.config, dataDir, simulateTelemetry: true, offline: true },
    currentMission: () => actual.MISSION_PROFILES.iss,
  };
});

// No NOAA data: the radiation card shows the mission baseline.
vi.mock("@/lib/sources/swpc", async (orig) => {
  const actual = await orig<typeof import("@/lib/sources/swpc")>();
  return {
    ...actual,
    getSpaceWeather: async () => {
      throw new Error("offline");
    },
  };
});

// The switch under test.
const ground = vi.hoisted(() => ({ switchedUp: true, forcedOffline: false, calls: 0 }));
vi.mock("@/lib/onboard/ground-link", () => ({
  getGroundLink: async () => {
    ground.calls++;
    return {
      up: ground.switchedUp && !ground.forcedOffline,
      switchedUp: ground.switchedUp,
      forcedOffline: ground.forcedOffline,
      changedAt: "2026-11-15T15:00:00.000Z",
      backend: "file",
    };
  },
}));

// Client hooks outside the app router; /crew redirects (caught here).
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("@/app/check-in/actions", () => ({ submitCheckIn: async () => null }));

const { BLACKOUT_ESCALATION, CRITICAL_BAND_ESCALATION, GROUND_LINK_DOWN_LABEL, LINK_PROFILES, groundLinkDownProfile } = await import(
  "@/lib/link"
);
const { effectiveLink } = await import("@/lib/onboard/effective-link");
const { listCrew } = await import("@/lib/store/readings");
const { INDICATORS } = await import("@/lib/health/knowledge");
const { LINK_SWITCH_DOWN_NOTE } = await import("@/components/link-switch");
const { MonitorLink } = await import("@/components/alarms/alarm-center");
const { monitorHref } = await import("@/components/alarms/alarm-model");
const { HazardCards } = await import("@/components/guidance/hazards");
const { ResultPanel } = await import("@/components/check-in/check-in-form");

const BANNED = /immediately|contact the flight surgeon|flight surgeon direction/i;

/** Visible text of rendered markup (tags dropped, escaped entities and no-break spaces decoded). */
const text = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");

type Sp = Record<string, string>;
const props = <P>(sp: Sp, params: Record<string, string> = {}) =>
  ({ params: Promise.resolve(params), searchParams: Promise.resolve(sp) }) as P;

let crewId = "";

const PAGES: Record<string, (sp: Sp) => Promise<string>> = {
  "/": async (sp) => {
    const { default: Page } = await import("@/app/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>(sp)));
  },
  "/crew/[id]": async (sp) => {
    const { default: Page } = await import("@/app/crew/[id]/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>(sp, { id: crewId })));
  },
  "/body": async (sp) => {
    const { default: Page } = await import("@/app/body/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>({ crew: crewId, region: "heart", ...sp })));
  },
  "/check-in": async (sp) => {
    const { default: Page } = await import("@/app/check-in/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>({ crew: crewId, ...sp })));
  },
  "/guidance": async (sp) => {
    const { default: Page } = await import("@/app/guidance/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>(sp)));
  },
  "/help": async (sp) => {
    const { default: Page } = await import("@/app/help/page");
    return renderToStaticMarkup(await Page(props<Parameters<typeof Page>[0]>(sp)));
  },
};

async function render(page: string, opts: { down: boolean; link?: string; offline?: boolean }): Promise<string> {
  ground.switchedUp = !opts.down;
  ground.forcedOffline = opts.offline ?? false;
  return PAGES[page](opts.link ? { link: opts.link } : {});
}

/**
 * The page's blackout instructions: every sentence that says what to do
 * without contact, with the name of the link replaced (the conjunction
 * profile or the ground-link switch), so the two renders can be compared.
 */
function blackoutSentences(t: string): string[] {
  const named = t
    .replaceAll(GROUND_LINK_DOWN_LABEL, "LINK")
    .replaceAll("ground link down (simulated blackout)", "LINK")
    .replaceAll("Signal delay profile Conjunction", "LINK")
    .replaceAll("signal delay profile Conjunction", "LINK")
    .replaceAll(LINK_PROFILES.conjunction.name, "LINK")
    .replaceAll("Contact rule for Ground link down", "Contact rule for LINK")
    .replaceAll("Contact rule for Conjunction", "Contact rule for LINK")
    .replaceAll("Ground link down: no contact", "LINK: no contact")
    .replaceAll("Conjunction: no contact", "LINK: no contact")
    // Guidance communication-delay card: the switch is the current link, listed above the profiles.
    .replaceAll("LINK Current No contact (blackout) ", "")
    .replaceAll("Conjunction Current No contact (blackout)", "Conjunction No contact (blackout)");
  return named
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /when contact returns|onboard procedures|escalation rule met/i.test(s))
    .sort();
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PITCH);
  crewId = (await listCrew())[0].id;
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  ground.switchedUp = true;
  ground.forcedOffline = false;
  search.value = "";
});

describe("effectiveLink", () => {
  it("switch up: the ?link= profile (or the mission's), unchanged", async () => {
    ground.switchedUp = true;
    expect(await effectiveLink(undefined)).toMatchObject({
      profile: LINK_PROFILES.iss,
      chosen: LINK_PROFILES.iss,
      selected: null,
      groundLinkDown: false,
      policy: { mode: "live" },
    });
    expect(await effectiveLink("conjunction")).toMatchObject({
      profile: LINK_PROFILES.conjunction,
      selected: "conjunction",
      groundLinkDown: false,
      policy: { mode: "blackout" },
    });
  });

  it("switch down: the no-contact policy named after the switch; the selection is kept", async () => {
    ground.switchedUp = false;
    const l = await effectiveLink("mars-transit");
    expect(l.groundLinkDown).toBe(true);
    expect(l.selected).toBe("mars-transit");
    expect(l.chosen).toBe(LINK_PROFILES["mars-transit"]);
    expect(l.profile).toEqual(groundLinkDownProfile(LINK_PROFILES["mars-transit"]));
    expect(l.profile).toMatchObject({ id: "mars-transit", label: GROUND_LINK_DOWN_LABEL, oneWayS: null });
    expect(l.policy).toEqual((await import("@/lib/link")).linkPolicy(null));
    expect(l.profile.basis).toBe(
      "the simulated ground-link switch is down, so there is no contact with the ground; the Mars (transit) profile applies again when the link is switched up",
    );
  });

  it("DEMIFY_OFFLINE alone (switch up, forced offline) is not a blackout", async () => {
    ground.switchedUp = true;
    ground.forcedOffline = true;
    expect(await effectiveLink(undefined)).toMatchObject({ groundLinkDown: false, policy: { mode: "live" } });
  });
});

describe("switch down: every page renders the blackout wording exactly like ?link=conjunction", () => {
  for (const page of Object.keys(PAGES)) {
    it(`${page}: the same blackout instructions, nothing that needs contact`, async () => {
      const down = text(await render(page, { down: true }));
      const conj = text(await render(page, { down: false, link: "conjunction" }));
      const sentences = blackoutSentences(conj);
      expect(sentences.length, page).toBeGreaterThan(0);
      expect(blackoutSentences(down), page).toEqual(sentences);
      // Whatever the conjunction page still says that needs contact (e.g. /help: "act immediately" on a red alarm), no more.
      const banned = (t: string) => t.match(new RegExp(BANNED.source, "gi")) ?? [];
      expect(banned(down), page).toEqual(banned(conj));
      expect(down, page).toContain(GROUND_LINK_DOWN_LABEL);
      expect(conj, page).not.toContain(GROUND_LINK_DOWN_LABEL);
    });
  }

  it("/: the header, the signal-delay card and the selector say no contact", async () => {
    const html = await render("/", { down: true });
    const t = text(html);
    expect(t).toContain(
      "No contact with the ground (blackout): act on the onboard procedures; transmit when contact returns. The crew assesses itself",
    );
    expect(t).toContain("No contact (blackout) Act on the onboard procedures; transmit when contact returns.");
    expect(t).toContain(`${GROUND_LINK_DOWN_LABEL}: ${groundLinkDownProfile(LINK_PROFILES.iss).basis}.`);
    expect(t).toContain(`${GROUND_LINK_DOWN_LABEL} ${LINK_SWITCH_DOWN_NOTE}`);
    expect(t).not.toContain("Every crew member's status at a glance.");
    // The selector stays usable and still marks the chosen profile (the mission's own, ISS).
    expect(html).toMatch(/aria-current="true"[^>]*>ISS</);
    expect(html).toContain('aria-describedby="link-switch-ground-down"');
    expect(html).toContain('href="/?link=conjunction"');
  });

  it("/crew/[id]: header, selector and checklist timing follow the blackout", async () => {
    const t = text(await render("/crew/[id]", { down: true }));
    expect(t).toContain("no contact with Earth (blackout)");
    expect(t).not.toContain("signal delay to Earth 0.5 s one way");
    expect(t).toContain(LINK_SWITCH_DOWN_NOTE);
  });

  it("/body and /check-in: the header names the switch", async () => {
    const line = `${GROUND_LINK_DOWN_LABEL}: no contact (blackout); act on the onboard procedures and transmit when contact returns.`;
    expect(text(await render("/body", { down: true }))).toContain(line);
    const checkIn = text(await render("/check-in", { down: true }));
    expect(checkIn).toContain(line);
    expect(checkIn).toContain(`In the critical band: re-check and log. ${CRITICAL_BAND_ESCALATION.blackout}`);
  });

  it("/guidance: escalation without contact and the communication-delay card names the switch", async () => {
    const t = text(await render("/guidance", { down: true }));
    expect(t).toContain("When to escalate (no contact)");
    expect(t).toContain("No contact: act on the onboard procedures");
    expect(t).toMatch(/Current mission ISS \(Low Earth Orbit\) ?, ground link down \(simulated blackout\) ?: no contact \(blackout\) ?\./);
    expect(t).toContain(`${GROUND_LINK_DOWN_LABEL} Current No contact (blackout)`);
    expect(t).not.toContain("When to call the flight surgeon");
  });

  it("/help: the alarm section and the diagram name the switch", async () => {
    const t = text(await render("/help", { down: true }));
    expect(t).toContain(`No contact: act on the onboard procedures ${GROUND_LINK_DOWN_LABEL}: no contact (blackout).`);
    expect(t).toContain("Contact rule for Ground link down: no contact: act on the onboard procedures; transmit when contact returns.");
    expect(t).toContain(`Re-check and log. ${CRITICAL_BAND_ESCALATION.blackout}`);
    expect(t).not.toContain("Call the flight surgeon directly");
  });

  it("a selected ?link= stays in the links and on the selector while the switch is down", async () => {
    const home = await render("/", { down: true, link: "mars-transit" });
    expect(home).toMatch(/aria-current="true"[^>]*>Mars \(transit\)</);
    expect(home).toContain("link=mars-transit");
    expect(text(home)).toContain("No contact with the ground (blackout)");
    const help = await render("/help", { down: true, link: "mars-transit" });
    expect(help).toContain('href="/check-in?link=mars-transit"');
    expect(help).toContain('href="/assistant?link=mars-transit"');
    expect(text(help)).not.toContain("Act first, then transmit");
    const crew = await render("/crew/[id]", { down: true, link: "mars-transit" });
    expect(crew).toContain(`href="/guidance?link=mars-transit#ind-heartRate"`);
  });
});

describe("switch up: nothing changes", () => {
  it("no ground-link wording on any page; live and ?link= wording as before", async () => {
    for (const page of Object.keys(PAGES)) {
      const t = text(await render(page, { down: false }));
      expect(t, page).not.toContain(GROUND_LINK_DOWN_LABEL);
      expect(t, page).not.toContain(LINK_SWITCH_DOWN_NOTE);
    }
    expect(text(await render("/", { down: false }))).toContain("Every crew member's status at a glance.");
    expect(text(await render("/body", { down: false, link: "conjunction" }))).toContain(
      "Signal delay profile Conjunction: no contact (blackout); act on the onboard procedures and transmit when contact returns.",
    );
    expect(text(await render("/help", { down: false, link: "mars-transit" }))).toContain("Act first, then transmit");
  });

  it("DEMIFY_OFFLINE alone keeps every page as it is", async () => {
    for (const page of Object.keys(PAGES)) {
      const offline = await render(page, { down: false, offline: true });
      const normal = await render(page, { down: false });
      expect(offline, page).toBe(normal);
    }
  });

  it("/crew keeps ?link= on its redirect, switch up or down", async () => {
    const { default: CrewIndexPage } = await import("@/app/crew/page");
    for (const down of [false, true]) {
      ground.switchedUp = !down;
      for (const [sp, want] of [
        [{ link: "conjunction" }, `/crew/${crewId}?link=conjunction`],
        [{ link: "bogus" }, `/crew/${crewId}`],
        [{}, `/crew/${crewId}`],
      ] as const) {
        const url = await CrewIndexPage(props<Parameters<typeof CrewIndexPage>[0]>(sp)).then(
          () => null,
          (e: unknown) => (e instanceof Redirect ? e.url : String(e)),
        );
        expect(url).toBe(want);
      }
    }
  });
});

describe("links keep ?link= (blackout sweep leftovers)", () => {
  it("alarm bar: Open monitor keeps the page's ?link=", () => {
    expect(monitorHref("cdr", "conjunction")).toBe("/crew/cdr?link=conjunction");
    expect(monitorHref("cdr", "Mars-Transit")).toBe("/crew/cdr?link=mars-transit");
    expect(monitorHref("cdr", "bogus")).toBe("/crew/cdr");
    expect(monitorHref("cdr")).toBe("/crew/cdr");
    search.value = "link=conjunction";
    expect(renderToStaticMarkup(createElement(MonitorLink, { crewId: "cdr", crewName: "Commander" }))).toContain(
      'href="/crew/cdr?link=conjunction"',
    );
    search.value = "";
    const plain = renderToStaticMarkup(createElement(MonitorLink, { crewId: "cdr", crewName: "Commander" }));
    expect(plain).toContain('href="/crew/cdr"');
    expect(text(plain)).toContain("Open monitor for Commander");
  });

  it("guidance hazard cards: body-system links keep ?link=", () => {
    expect(renderToStaticMarkup(createElement(HazardCards, { link: "conjunction" }))).toContain(
      'href="/body?region=heart&amp;link=conjunction"',
    );
    const clean = renderToStaticMarkup(createElement(HazardCards));
    expect(clean).toContain('href="/body?region=heart"');
    expect(clean).not.toContain("link=");
  });

  it("/guidance?link=conjunction: no body-map link drops it", async () => {
    const html = await render("/guidance", { down: false, link: "conjunction" });
    expect(html).toContain('href="/body?region=heart&amp;link=conjunction"');
    expect(html).not.toMatch(/href="\/body\?region=[a-z]+"/);
  });

  it("crew health record: the guidance links keep ?link=", async () => {
    const html = await render("/crew/[id]", { down: false, link: "conjunction" });
    expect(html).toContain('href="/guidance?link=conjunction#ind-heartRate"');
    const clean = await render("/crew/[id]", { down: false });
    expect(clean).toContain('href="/guidance#ind-heartRate"');
  });
});

describe("check-in result: crew actions follow the link (actionUnderLink)", () => {
  const result = {
    ok: true as const,
    crewName: "Mission Specialist 2",
    takenAt: "2026-11-15T15:00:00.000Z",
    overall: "critical" as const,
    otherEscalations: [],
    items: [
      {
        indicator: "stDeviation" as const,
        value: 1.5,
        unit: "mm",
        status: "critical" as const,
        finding: "ST segment 1.5 mm: critical: contact the flight surgeon.",
        actions: INDICATORS.stDeviation.actions,
        escalate: true,
      },
      {
        indicator: "mood" as const,
        value: 2,
        unit: "/10",
        status: "critical" as const,
        finding: "Mood 2 /10: in the critical band: re-check and log.",
        actions: INDICATORS.mood.actions,
        escalate: false,
      },
    ],
  };
  const panel = (commDelaySeconds: number | null, link: "conjunction" | null) =>
    text(
      renderToStaticMarkup(
        createElement(ResultPanel, { result, headingRef: createRef<HTMLHeadingElement>(), commDelaySeconds, crewId: "ms2", link }),
      ),
    );

  it("blackout: the ECG and chest-pain steps wait for contact; ground steps say when contact returns", () => {
    const t = panel(null, "conjunction");
    expect(t).toContain("Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.");
    expect(t).toContain("Follow the onboard medical checklist for chest pain.");
    expect(t).toContain("Schedule personal time and a call with family when contact returns.");
    expect(t).toContain(`ST segment 1.5 mm: critical: ${BLACKOUT_ESCALATION}.`);
    expect(t).not.toMatch(BANNED);
  });

  it("live: the actions as written", () => {
    const t = panel(0.5, null);
    expect(t).toContain("Record and transmit a 12-lead ECG to the flight surgeon immediately.");
    expect(t).toContain("Schedule personal time and a call with family.");
    expect(t).not.toContain("when contact returns");
  });
});

describe("/help: onboard server and assistant, user guide", () => {
  it("has the section, its table-of-contents entry and links to /assistant and /library", async () => {
    const html = await render("/help", { down: false });
    expect(html).toContain('href="#onboard"');
    expect(html).toContain('id="onboard"');
    const t = text(html);
    expect(t).toContain("Onboard server and assistant");
    expect(t).toContain("It advises, never decides: the crew and, when the ground link is up, the flight surgeons make every medical decision.");
    expect(t).toContain("last synced 14 hours ago");
    expect(t).toContain("Laptop mode");
    expect(t).toContain("Onboard server");
    expect(t).toContain("is not a blackout");
    expect(t).toContain("Demify does not connect to any ISS system.");
    expect(html).toContain('href="/assistant"');
    expect(html).toContain('href="/library"');
    const section = t.slice(t.indexOf("Onboard server and assistant The onboard assistant"), t.indexOf("Connecting a real sensor"));
    expect(section.length).toBeGreaterThan(500);
    expect(section).not.toMatch(/AI[\s-]+powered|decision[\s-]+support|not a medical device|internet|\bdetects?\b|\bdiagnoses\b|\bfirst\b|\bonly\b/i);
    expect(section).not.toMatch(BANNED);
  });

  it("offers the user guide as a visible PDF download", async () => {
    const html = await render("/help", { down: false });
    expect(html).toMatch(/<a href="\/docs\/demify-user-guide\.pdf" download=""[^>]*>.*User guide \(PDF\)<\/a>/);
  });
});

describe("getGroundLink is read per request", () => {
  it("each page render asks the switch", async () => {
    const before = ground.calls;
    await render("/guidance", { down: true });
    expect(ground.calls).toBeGreaterThan(before);
  });
});
