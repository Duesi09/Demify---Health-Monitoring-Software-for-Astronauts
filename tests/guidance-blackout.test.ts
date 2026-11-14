import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /guidance, /help and /crew under the signal-delay link (?link=). In a
 * blackout (solar conjunction) there is no one to call: the escalation tiers,
 * the conferences, the crew actions in the indicator reference and the help
 * routine follow the onboard procedures and transmit when contact returns.
 * Live and delayed links keep their wording, and links keep ?link=.
 */

// The indicator reference opens the entry named in the URL hash; on the server
// that hash is empty, so the tests pick it here.
const hash = vi.hoisted(() => ({ value: "" }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useSyncExternalStore: () => hash.value };
});

// /crew redirects to the first crew member: keep the store in memory and catch the redirect.
class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/lib/store/readings", () => ({
  listCrew: async () => [{ id: "ms2", name: "Mission Specialist 2", role: "Flight Engineer", baseline: { heartRate: 60 } }],
  listReadings: async () => [],
}));

const { INDICATORS } = await import("@/lib/health/knowledge");
const { IndicatorReference } = await import("@/components/guidance/indicator-reference");
const { EscalationProtocol, PrivateConferences } = await import("@/components/guidance/escalation-protocol");
const { CRITICAL_BAND_ESCALATION } = await import("@/lib/link");

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
    .replace(/ /g, " ")
    .replace(/\s+/g, " ");

/** Markup between two element ids (a page section). */
const section = (html: string, from: string, to: string) => html.slice(html.indexOf(`id="${from}"`), html.indexOf(`id="${to}"`));

async function guidance(link?: string) {
  const { default: GuidancePage } = await import("@/app/guidance/page");
  const props = { params: Promise.resolve({}), searchParams: Promise.resolve(link ? { link } : {}) } as Parameters<typeof GuidancePage>[0];
  return renderToStaticMarkup(await GuidancePage(props));
}

async function help(link?: string) {
  const { default: HelpPage } = await import("@/app/help/page");
  const props = { params: Promise.resolve({}), searchParams: Promise.resolve(link ? { link } : {}) } as Parameters<typeof HelpPage>[0];
  return renderToStaticMarkup(await HelpPage(props));
}

beforeEach(() => {
  hash.value = "";
});

describe("/guidance?link=conjunction", () => {
  it("escalation tiers act on the onboard procedures, prepare the report and transmit when contact returns", async () => {
    const html = await guidance("conjunction");
    const esc = text(section(html, "escalation", "reference"));
    expect(esc).toContain("When to escalate (no contact)");
    expect(esc).toContain("1 · Emergency Act on the onboard emergency procedure");
    expect(esc).toContain(
      "Start the onboard emergency procedure first. No contact (blackout): log every reading and action, prepare the report for the flight surgeon and transmit it when contact returns.",
    );
    expect(esc).toContain("2 · Now Act on the onboard procedures; prepare the report");
    expect(esc).toContain(
      "The Body Map shows a red escalation callout when this applies. No contact (blackout): act on the onboard procedures, prepare the report for the flight surgeon and transmit it when contact returns.",
    );
    expect(esc).not.toContain("Act immediately, then call");
    expect(esc).not.toContain("When to call the flight surgeon");
    expect(esc).not.toMatch(BANNED);
    // The communication-delay card and the table criteria are already link-neutral.
    expect(esc).toContain("No contact: act on the onboard procedures");
    expect(esc).toContain(INDICATORS.visionChange.escalation);
    expect(esc).toContain(INDICATORS.mood.escalation);
  });

  it("private conferences: requested when contact returns, not now", async () => {
    const t = text(await guidance("conjunction"));
    expect(t).toContain("warrants requesting one when contact returns. Until then, act on the onboard procedures with the Crew Medical Officer.");
    expect(t).toContain("request an unscheduled one when contact returns.");
    expect(t).not.toContain("requesting one now");
    expect(t).not.toContain("at any time");
  });

  it("the ST flag is labelled as a project rule", async () => {
    const t = text(await guidance("conjunction"));
    expect(t).toContain("Any value ≥ 1 mm elevation or > 2 mm depression (project rule)");
  });

  it("#ind-stDeviation shows the rewritten ECG and chest-pain actions", async () => {
    hash.value = "#ind-stDeviation";
    const html = await guidance("conjunction");
    const t = text(section(html, "reference", "__none__"));
    expect(t).toContain("Record the 12-lead ECG; transmit it to the flight surgeon when contact returns.");
    expect(t).toContain("Follow the onboard medical checklist for chest pain.");
    expect(t).not.toMatch(BANNED);
    expect(html).toContain('href="/body?region=heart&amp;link=conjunction"');
  });
});

describe("/guidance under a live or delayed link: nothing changes", () => {
  it("keeps the call wording, the conference wording and the original actions", async () => {
    hash.value = "#ind-stDeviation";
    for (const link of ["iss", "mars-transit", undefined]) {
      const html = await guidance(link);
      const t = text(html);
      expect(t, link).toContain("When to call the flight surgeon");
      expect(t, link).toContain("1 · Emergency Act immediately, then call");
      expect(t, link).toContain("Start the onboard emergency procedure first; the call must not delay treatment.");
      expect(t, link).toContain("2 · Now Contact the flight surgeon");
      expect(t, link).toContain("The Body Map shows a red escalation callout when this applies.");
      expect(t, link).not.toContain("No contact (blackout): act on the onboard procedures, prepare the report");
      expect(t, link).toContain("warrants requesting one now.");
      expect(t, link).toContain("you can also request an unscheduled one at any time.");
      expect(t, link).toContain("Record and transmit a 12-lead ECG to the flight surgeon immediately.");
      expect(t, link).toContain("Follow the onboard medical checklist for chest pain; contact the flight surgeon.");
    }
    expect(await guidance("mars-transit")).toContain('href="/body?region=heart&amp;link=mars-transit"');
    const clean = await guidance();
    expect(clean).toContain('href="/body?region=heart"');
    expect(clean).not.toContain("link=");
  });

  it("components default to the live wording", () => {
    const t = text(renderToStaticMarkup(createElement(EscalationProtocol)) + renderToStaticMarkup(createElement(PrivateConferences)));
    expect(t).toContain("Act immediately, then call");
    expect(t).toContain("requesting one now.");
  });
});

describe("indicator reference: crew actions follow the link", () => {
  const reference = (id: string, mode: "live" | "delayed" | "blackout") => {
    hash.value = `#ind-${id}`;
    return text(renderToStaticMarkup(createElement(IndicatorReference, { mode, link: mode === "blackout" ? "conjunction" : null })));
  };

  it("blackout: steps that need the ground wait for contact", () => {
    expect(reference("mood", "blackout")).toContain("Schedule personal time and a call with family when contact returns.");
    expect(reference("stress", "blackout")).toContain("Raise workload concerns at the daily planning conference when contact returns.");
    expect(reference("radiationCumulative", "blackout")).toContain("Review planned high-exposure activities with ground when contact returns.");
  });

  it("live and delayed keep the actions as written", () => {
    for (const mode of ["live", "delayed"] as const) {
      const t = reference("mood", mode);
      expect(t).toContain("Schedule personal time and a call with family.");
      expect(t).not.toContain("when contact returns");
    }
  });
});

describe("/help follows the link", () => {
  it("blackout: the critical row, step 5 and the routine diagram prompt the onboard procedures", async () => {
    const html = await help("conjunction");
    const t = text(html);
    expect(t).toContain(`Re-check and log. ${CRITICAL_BAND_ESCALATION.blackout}`);
    expect(t).toContain(
      "An escalation banner shows when an escalation rule is met; in a real mission it prompts the onboard procedures (no contact). In a real situation, never wait for it.",
    );
    expect(t).toContain("Training: in a real mission the escalation prompts the onboard procedures (no contact).");
    // The diagram's text alternative (aria-label) too.
    expect(html).toContain("practise the response: in a real mission the escalation banner prompts the onboard procedures (no contact)");
    expect(html).not.toContain("practise the call");
    expect(t).toContain("Practise the response");
    expect(t).not.toContain("the flight surgeon would be called");
    expect(t).not.toContain("prompts a flight surgeon call");
    expect(t).not.toContain("Escalation only when Demify shows “contact the flight surgeon”");
  });

  it("the routine links keep ?link=", async () => {
    const html = await help("conjunction");
    for (const href of [
      "/check-in?link=conjunction",
      "/guidance?link=conjunction#reference",
      "/?link=conjunction",
      "/body?link=conjunction",
      "/crew?link=conjunction",
      "/guidance?link=conjunction#escalation",
    ]) {
      expect(html, href).toContain(`href="${href}"`);
    }
  });

  it("live and delayed keep the call wording; without ?link= the links stay clean", async () => {
    for (const link of ["iss", "mars-transit", undefined]) {
      const html = await help(link);
      const t = text(html);
      expect(html, link).toContain("practise the call: in a real mission the escalation banner prompts a call to the flight surgeon");
      expect(t, link).toContain(
        "Re-check and log. Escalation only when Demify shows “contact the flight surgeon”. Training: in a real mission this prompts a call to the flight surgeon.",
      );
      expect(t, link).toContain(
        "An escalation banner shows when, in a real mission, the flight surgeon would be called. In a real situation, never wait for it.",
      );
      expect(t, link).toContain("Training: in a real mission the escalation prompts a call to the flight surgeon.");
      expect(t, link).toContain("Practise the call");
      expect(t, link).not.toContain("(no contact)");
    }
    const clean = await help();
    expect(clean).toContain('href="/check-in"');
    expect(clean).toContain('href="/guidance#escalation"');
    expect(clean).not.toContain("link=");
  });
});

describe("/crew keeps ?link= on its redirect", () => {
  async function crewRedirect(sp: Record<string, string>): Promise<string> {
    const { default: CrewIndexPage } = await import("@/app/crew/page");
    const props = { params: Promise.resolve({}), searchParams: Promise.resolve(sp) } as Parameters<typeof CrewIndexPage>[0];
    try {
      await CrewIndexPage(props);
    } catch (e) {
      if (e instanceof Redirect) return e.url;
      throw e;
    }
    throw new Error("no redirect");
  }

  it("valid ?link= is kept, unknown or missing is dropped", async () => {
    expect(await crewRedirect({ link: "conjunction" })).toBe("/crew/ms2?link=conjunction");
    expect(await crewRedirect({ link: "Mars-Transit" })).toBe("/crew/ms2?link=mars-transit");
    expect(await crewRedirect({ link: "bogus" })).toBe("/crew/ms2");
    expect(await crewRedirect({})).toBe("/crew/ms2");
  });
});
