import type { MissionProfileId } from "./types";

/**
 * Signal-delay ("link") profiles: how long a message takes between the crew
 * and the ground. Pure and client-safe (no node: imports), so server pages
 * and client components share one table, one policy and one formatter.
 *
 * The mission profile (gravity, duration, dose rate) still comes from
 * DEMIFY_MISSION in config.ts; a link profile only drives the delay. Pages
 * read a `?link=<LinkProfileId>` search parameter on the server so every
 * delay string on the page changes together; an unknown value falls back to
 * the DEMIFY_MISSION profile's delay.
 *
 * Light times are computed, not typed in: tau = distance_km / c. The ISS
 * and mid-transit values are illustrative fixed numbers (labelled as such).
 * Mars in general is "about 3 to 22 minutes one way"; the far end of that
 * range (about 2.67 AU, 22.2 min) is only reached around solar conjunction,
 * when there is no contact at all, so no profile shows live contact there.
 */

/** Speed of light in vacuum, km/s (exact, SI). */
export const SPEED_OF_LIGHT_KM_S = 299_792.458;
/** Astronomical unit in km (IAU 2012, exact). */
export const AU_KM = 149_597_870.7;
/** Mean Earth-Moon distance used for the lunar profile, km. */
export const MOON_DISTANCE_KM = 384_400;

/** One-way light time in seconds over a distance in km. */
export function lightTimeSeconds(distanceKm: number): number {
  return distanceKm / SPEED_OF_LIGHT_KM_S;
}

/** One-way delays at or above this are "delayed": no real-time conversation. */
export const LIVE_LIMIT_S = 60;

/** How the UI states the Earth-Mars delay when no specific distance is meant. */
export const MARS_DELAY_RANGE = "about 3 to 22 minutes one way";

/** Default length of a solar-conjunction blackout, days (a parameter, not a constant of nature). */
export const DEFAULT_BLACKOUT_DAYS = 14;

export const LINK_PROFILE_IDS = [
  "iss",
  "artemis-lunar",
  "mars-nearest",
  "mars-transit",
  "mars-far",
  "conjunction",
] as const;

export type LinkProfileId = (typeof LINK_PROFILE_IDS)[number];

export interface LinkProfile {
  id: LinkProfileId;
  /** Selector label, sentence case: "ISS", "Moon", "Mars (nearest)". */
  label: string;
  /** Name for sentences, e.g. "Mars transit". */
  name: string;
  /** One-way delay in seconds; null means no contact (blackout). */
  oneWayS: number | null;
  /** Where the number comes from, e.g. "light time at about 384,400 km". */
  basis: string;
  /** Distance used for a computed light time, km. */
  distanceKm?: number;
  /** Blackout length in days (conjunction only). */
  blackoutDays?: number;
}

const MARS_NEAREST_AU = 0.37;
const MARS_FAR_AU = 2.5;
/** Fixed mid-range transit delay (illustrative). */
const MARS_TRANSIT_S = 750;
/** ISS: TDRS relay plus ground-network latency (illustrative). */
const ISS_S = 0.5;

function conjunction(blackoutDays: number): LinkProfile {
  return {
    id: "conjunction",
    label: "Conjunction",
    name: "Mars solar conjunction",
    oneWayS: null,
    basis: `Sun between Earth and Mars (solar conjunction), ${blackoutDays}-day blackout in this simulation (illustrative)`,
    blackoutDays,
  };
}

/** The six link profiles, in selector order. */
export const LINK_PROFILES: Record<LinkProfileId, LinkProfile> = {
  iss: {
    id: "iss",
    label: "ISS",
    name: "ISS (low Earth orbit)",
    oneWayS: ISS_S,
    basis: "relay through geostationary TDRS satellites plus network latency (illustrative)",
  },
  "artemis-lunar": {
    id: "artemis-lunar",
    label: "Moon",
    name: "Moon (Artemis)",
    oneWayS: lightTimeSeconds(MOON_DISTANCE_KM),
    basis: "light time at about 384,400 km",
    distanceKm: MOON_DISTANCE_KM,
  },
  "mars-nearest": {
    id: "mars-nearest",
    label: "Mars (nearest)",
    name: "Mars at closest approach",
    oneWayS: lightTimeSeconds(MARS_NEAREST_AU * AU_KM),
    basis: `light time at ${MARS_NEAREST_AU} AU, Mars near its closest approach`,
    distanceKm: MARS_NEAREST_AU * AU_KM,
  },
  "mars-transit": {
    id: "mars-transit",
    label: "Mars (transit)",
    name: "Mars transit",
    oneWayS: MARS_TRANSIT_S,
    basis: "fixed 750 s, mid-range transit (illustrative)",
  },
  "mars-far": {
    id: "mars-far",
    label: "Mars (far)",
    name: "Mars far from Earth",
    oneWayS: lightTimeSeconds(MARS_FAR_AU * AU_KM),
    basis: `light time at about ${MARS_FAR_AU} AU, just outside conjunction (upper bound with contact)`,
    distanceKm: MARS_FAR_AU * AU_KM,
  },
  conjunction: conjunction(DEFAULT_BLACKOUT_DAYS),
};

/** The conjunction profile with another blackout length (days, > 0). */
export function conjunctionProfile(blackoutDays = DEFAULT_BLACKOUT_DAYS): LinkProfile {
  return conjunction(Number.isFinite(blackoutDays) && blackoutDays > 0 ? blackoutDays : DEFAULT_BLACKOUT_DAYS);
}

/** Link profile each DEMIFY_MISSION value implies when no ?link= is given. */
export const MISSION_LINK: Record<MissionProfileId, LinkProfileId> = {
  iss: "iss",
  "artemis-lunar": "artemis-lunar",
  "mars-transit": "mars-transit",
};

export function isLinkProfileId(value: unknown): value is LinkProfileId {
  return typeof value === "string" && (LINK_PROFILE_IDS as readonly string[]).includes(value);
}

/**
 * A `?link=` search parameter as a profile id, or null when it is missing or
 * unknown (the caller then uses the mission's own link). Repeated parameters
 * use the first value, like Next.js `searchParams` arrays.
 */
export function parseLinkParam(value: string | string[] | undefined | null): LinkProfileId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = raw?.trim().toLowerCase();
  return isLinkProfileId(id) ? id : null;
}

export interface ResolvedLink {
  profile: LinkProfile;
  /** The id from ?link= when it was valid, else null (keep URLs clean: only propagate an explicit choice). */
  selected: LinkProfileId | null;
}

/** ?link= when valid, otherwise the DEMIFY_MISSION profile's link. */
export function resolveLink(param: string | string[] | undefined | null, mission: MissionProfileId): ResolvedLink {
  const selected = parseLinkParam(param);
  return { profile: LINK_PROFILES[selected ?? MISSION_LINK[mission] ?? "iss"], selected };
}

/* ------------------------------------------------------------------------- */
/* Policy and formatting                                                      */
/* ------------------------------------------------------------------------- */

/** Up to one decimal, no trailing ".0": 0.5, 1.3, 12.5, 25. */
function oneDecimal(n: number): string {
  return String(Number(n.toFixed(1)));
}

/**
 * A delay as a short human string: "0.5 s", "1.3 s", "3.1 min", "12.5 min",
 * "1.4 h". The one delay formatter for the whole app.
 */
export function formatDelay(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < LIVE_LIMIT_S) return `${oneDecimal(seconds)} s`;
  if (seconds < 3600) return `${oneDecimal(seconds / 60)} min`;
  return `${oneDecimal(seconds / 3600)} h`;
}

export type LinkMode = "live" | "delayed" | "blackout";

export interface LinkPolicy {
  /**
   * live: near real-time conversation (< 60 s one way); delayed: act first,
   * then report; blackout: no contact at all.
   */
  mode: LinkMode;
  oneWayS: number | null;
  /** Round trip in seconds; null in a blackout. */
  roundTripS: number | null;
  /** One-way delay in words: "0.5 s", "12.5 min" or "no contact (blackout)". */
  label: string;
  /** Round trip in words, null in a blackout. */
  roundTripLabel: string | null;
  /** "0.5 s one way", "12.5 min one way, 25 min round trip", "no contact (blackout)". */
  summary: string;
  /** What the crew does about the ground under this link, as a lower-case clause. */
  advice: string;
}

/** Advice during a blackout (also used verbatim by the UI). */
export const BLACKOUT_ADVICE = "act on the onboard procedures; transmit when contact returns";
export const BLACKOUT_LABEL = "no contact (blackout)";

/**
 * Single source for "is the ground reachable in real time?". Replaces the
 * scattered `commDelaySeconds >= 60` checks.
 */
export function linkPolicy(oneWayS: number | null): LinkPolicy {
  if (oneWayS == null || !Number.isFinite(oneWayS) || oneWayS < 0) {
    return {
      mode: "blackout",
      oneWayS: null,
      roundTripS: null,
      label: BLACKOUT_LABEL,
      roundTripLabel: null,
      summary: BLACKOUT_LABEL,
      advice: BLACKOUT_ADVICE,
    };
  }
  const roundTripS = oneWayS * 2;
  const label = formatDelay(oneWayS);
  const roundTripLabel = formatDelay(roundTripS);
  if (oneWayS < LIVE_LIMIT_S) {
    return {
      mode: "live",
      oneWayS,
      roundTripS,
      label,
      roundTripLabel,
      summary: `${label} one way`,
      advice: "near real-time consultation is possible",
    };
  }
  return {
    mode: "delayed",
    oneWayS,
    roundTripS,
    label,
    roundTripLabel,
    summary: `${label} one way, ${roundTripLabel} round trip`,
    advice: "act first, then report; do not wait for a reply",
  };
}

/**
 * Adds `link=<id>` to an internal href (keeps other query parameters and the
 * hash). No-op when id is null, so URLs stay clean without an explicit choice.
 */
export function withLink(href: string, id: LinkProfileId | null): string {
  if (!id) return href;
  const hashAt = href.indexOf("#");
  const base = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const qAt = base.indexOf("?");
  const path = qAt >= 0 ? base.slice(0, qAt) : base;
  const params = new URLSearchParams(qAt >= 0 ? base.slice(qAt + 1) : "");
  params.set("link", id);
  return `${path}?${params.toString()}${hash}`;
}
