import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AU_KM,
  BLACKOUT_ADVICE,
  LINK_PROFILES,
  LINK_PROFILE_IDS,
  LIVE_LIMIT_S,
  MARS_DELAY_RANGE,
  MISSION_LINK,
  conjunctionProfile,
  formatDelay,
  lightTimeSeconds,
  linkPolicy,
  parseLinkParam,
  resolveLink,
  withLink,
} from "@/lib/link";
import { MISSION_PROFILES } from "@/lib/config";
import { buildProtocol } from "@/components/crew/protocols";
import { EscalationBanner, type EscalationItem } from "@/components/overview/escalation-banner";
import { LinkSwitch } from "@/components/link-switch";

/** Relative error |a - b| / b. */
const rel = (a: number, b: number) => Math.abs(a - b) / b;
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("link profiles: light times", () => {
  it("uses c = 299,792.458 km/s and 1 AU = 149,597,870.7 km", () => {
    expect(lightTimeSeconds(299_792.458)).toBe(1);
    expect(lightTimeSeconds(AU_KM)).toBeCloseTo(499.005, 3);
  });

  it.each([
    ["artemis-lunar", 1.28],
    ["mars-nearest", 3.1 * 60],
    ["mars-far", 20.8 * 60],
  ] as const)("%s is within 1 %% of %s s", (id, expected) => {
    const s = LINK_PROFILES[id].oneWayS!;
    expect(rel(s, expected)).toBeLessThan(0.01);
  });

  it("keeps the illustrative fixed values for ISS and mid transit", () => {
    expect(LINK_PROFILES.iss.oneWayS).toBe(0.5);
    expect(LINK_PROFILES["mars-transit"].oneWayS).toBe(750);
    expect(LINK_PROFILES.iss.basis).toMatch(/TDRS.*\(illustrative\)/);
    expect(LINK_PROFILES["mars-transit"].basis).toBe("fixed 750 s, mid-range transit (illustrative)");
  });

  it("models conjunction as no contact, 14 days by default, length a parameter", () => {
    expect(LINK_PROFILES.conjunction.oneWayS).toBeNull();
    expect(LINK_PROFILES.conjunction.blackoutDays).toBe(14);
    expect(conjunctionProfile(10).blackoutDays).toBe(10);
    expect(conjunctionProfile(-3).blackoutDays).toBe(14);
  });

  it("never shows live contact at 2.67 AU / 22.2 min: every profile with contact is below 21 min", () => {
    const farthest = lightTimeSeconds(2.67 * AU_KM);
    expect(farthest / 60).toBeCloseTo(22.2, 1);
    for (const id of LINK_PROFILE_IDS) {
      const s = LINK_PROFILES[id].oneWayS;
      if (s != null) expect(s, id).toBeLessThan(21 * 60);
    }
    expect(MARS_DELAY_RANGE).toBe("about 3 to 22 minutes one way");
  });

  it("has sentence-case selector labels in a fixed order", () => {
    expect(LINK_PROFILE_IDS.map((id) => LINK_PROFILES[id].label)).toEqual([
      "ISS",
      "Moon",
      "Mars (nearest)",
      "Mars (transit)",
      "Mars (far)",
      "Conjunction",
    ]);
  });

  it("derives the mission profiles' delays from the same table", () => {
    for (const m of Object.values(MISSION_PROFILES)) {
      const link = LINK_PROFILES[MISSION_LINK[m.id]];
      expect(m.commDelaySeconds).toBe(link.oneWayS);
      expect(m.delayBasis).toBe(link.basis);
    }
  });
});

describe("formatDelay (the one delay formatter)", () => {
  it.each([
    [0.5, "0.5 s"],
    [1.2822, "1.3 s"],
    [2, "2 s"],
    [184.6, "3.1 min"],
    [750, "12.5 min"],
    [1500, "25 min"],
    [1247.6, "20.8 min"],
    [7200, "2 h"],
  ])("%s s -> %s", (s, out) => {
    expect(formatDelay(s)).toBe(out);
  });

  it("returns a dash for impossible values", () => {
    expect(formatDelay(Number.NaN)).toBe("—");
    expect(formatDelay(-1)).toBe("—");
  });
});

describe("linkPolicy", () => {
  it("is live below 60 s one way", () => {
    for (const id of ["iss", "artemis-lunar"] as const) {
      const p = linkPolicy(LINK_PROFILES[id].oneWayS);
      expect(p.mode, id).toBe("live");
    }
    expect(linkPolicy(59.9).mode).toBe("live");
    expect(linkPolicy(0.5)).toMatchObject({ mode: "live", roundTripS: 1, label: "0.5 s", summary: "0.5 s one way" });
  });

  it("is delayed from 60 s, with the round trip", () => {
    expect(linkPolicy(LIVE_LIMIT_S).mode).toBe("delayed");
    for (const id of ["mars-nearest", "mars-transit", "mars-far"] as const) {
      expect(linkPolicy(LINK_PROFILES[id].oneWayS).mode, id).toBe("delayed");
    }
    expect(linkPolicy(750)).toMatchObject({
      mode: "delayed",
      roundTripS: 1500,
      label: "12.5 min",
      roundTripLabel: "25 min",
      summary: "12.5 min one way, 25 min round trip",
    });
  });

  it("is a blackout without contact", () => {
    const p = linkPolicy(null);
    expect(p).toMatchObject({ mode: "blackout", roundTripS: null, label: "no contact (blackout)" });
    expect(p.advice).toBe(BLACKOUT_ADVICE);
    expect(BLACKOUT_ADVICE).toBe("act on the onboard procedures; transmit when contact returns");
    expect(linkPolicy(LINK_PROFILES.conjunction.oneWayS).mode).toBe("blackout");
    expect(linkPolicy(Number.NaN).mode).toBe("blackout");
  });
});

describe("?link= parsing and fallback", () => {
  it("accepts every profile id, case-insensitively, and the first of repeated values", () => {
    for (const id of LINK_PROFILE_IDS) expect(parseLinkParam(id)).toBe(id);
    expect(parseLinkParam(" Mars-Transit ")).toBe("mars-transit");
    expect(parseLinkParam(["conjunction", "iss"])).toBe("conjunction");
  });

  it("rejects unknown and missing values", () => {
    for (const v of [undefined, null, "", "mars", "constructor", "__proto__", "toString", []]) {
      expect(parseLinkParam(v as string | string[] | undefined)).toBeNull();
    }
  });

  it("falls back to the DEMIFY_MISSION profile's link", () => {
    expect(resolveLink(undefined, "iss")).toEqual({ profile: LINK_PROFILES.iss, selected: null });
    expect(resolveLink("bogus", "mars-transit")).toEqual({ profile: LINK_PROFILES["mars-transit"], selected: null });
    expect(resolveLink("bogus", "artemis-lunar").profile.id).toBe("artemis-lunar");
    expect(resolveLink("conjunction", "iss")).toEqual({ profile: LINK_PROFILES.conjunction, selected: "conjunction" });
  });

  it("withLink adds the parameter, keeps others and the hash, and is a no-op without a choice", () => {
    expect(withLink("/crew/cdr", null)).toBe("/crew/cdr");
    expect(withLink("/crew/cdr", "mars-transit")).toBe("/crew/cdr?link=mars-transit");
    expect(withLink("/check-in?crew=cdr", "iss")).toBe("/check-in?crew=cdr&link=iss");
    expect(withLink("/?crew=cdr#detail", "conjunction")).toBe("/?crew=cdr&link=conjunction#detail");
    expect(withLink("/?link=iss", "mars-far")).toBe("/?link=mars-far");
  });
});

describe("delay wording follows the policy", () => {
  const item: EscalationItem = {
    crewId: "cdr",
    crewName: "Commander",
    role: "Commander",
    findings: [{ indicator: "systolicBP", status: "critical", finding: "Systolic BP 190 mmHg.", source: "manual" }],
  };
  const banner = (s: number | null, link: "conjunction" | null = null) =>
    text(renderToStaticMarkup(createElement(EscalationBanner, { items: [item], commDelaySeconds: s, link })));

  it("escalation banner: live, delayed and blackout", () => {
    expect(banner(0.5)).toMatch(/Request a private medical conference .* \(signal delay 0\.5 s\)/);
    expect(banner(750)).toMatch(/One-way signal delay is 12\.5 min \. Do not wait for a reply/);
    const b = banner(null, "conjunction");
    expect(b).toMatch(/no contact \(blackout\)/);
    expect(b).toMatch(/Act on the onboard procedures: .* transmit when contact returns/);
    expect(b).not.toMatch(/Request a private medical conference/);
    expect(renderToStaticMarkup(createElement(EscalationBanner, { items: [item], commDelaySeconds: null, link: "conjunction" }))).toContain(
      'href="/crew/cdr?link=conjunction"',
    );
  });

  it("protocol surgeon step: live, delayed and blackout", () => {
    const step = (s: number | null) => buildProtocol("stemi", { commDelaySeconds: s, missionName: "Test link" }).steps.find((x) => x.id === "surgeon")!;
    expect(step(0.5).detail).toBe("Test link: signal delay 0.5 s one way, near real-time consultation is possible.");
    expect(step(750).detail).toMatch(/^Test link: signal delay 12\.5 min one way, 25 min round trip\. Do not wait/);
    expect(step(null).text).toMatch(/^Prepare the report for the flight surgeon/);
    expect(step(null).detail).toBe("Test link: no contact (blackout). Act on the onboard procedures; transmit when contact returns.");
  });

  it("selector: plain links that keep ?crew=, current one marked aria-current", () => {
    const html = renderToStaticMarkup(createElement(LinkSwitch, { active: "mars-transit", path: "/check-in", query: { crew: "cdr" } }));
    for (const id of LINK_PROFILE_IDS) expect(html).toContain(`href="/check-in?crew=cdr&amp;link=${id}"`);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*>Mars \(transit\)</);
  });
});
