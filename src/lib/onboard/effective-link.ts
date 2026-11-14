import "server-only";
import { currentLink } from "@/lib/config";
import { groundLinkDownProfile, linkPolicy, type LinkPolicy, type LinkProfile, type ResolvedLink } from "@/lib/link";
import { getGroundLink } from "./ground-link";

/**
 * The link a page renders under: ONE blackout for the whole app.
 *
 * While the simulated ground-link switch is down (GroundLinkState.switchedUp
 * false) every page behaves exactly as under the conjunction profile: no
 * contact, act on the onboard procedures, transmit when contact returns. The
 * profile is then groundLinkDownProfile (oneWayS null, label "Ground link down
 * (simulated blackout)"). DEMIFY_OFFLINE=true alone (an air-gapped
 * deployment) is not a blackout: switchedUp ignores it, so pages stay as they
 * are. Otherwise the result is currentLink(param) as before: a valid ?link=,
 * else the DEMIFY_MISSION profile's own link.
 *
 * `selected` stays the ?link= choice either way, so links inside the page keep
 * it (withLink) and the selector still marks it.
 */
export interface EffectiveLink extends ResolvedLink {
  /** The profile ?link= (else DEMIFY_MISSION) chooses; equal to `profile` while the ground link is up. */
  chosen: LinkProfile;
  /** linkPolicy(profile.oneWayS): the blackout policy while the switch is down. */
  policy: LinkPolicy;
  /** The simulated ground-link switch is down. */
  groundLinkDown: boolean;
}

/**
 * true only when the switch is known to be down. getGroundLink never throws
 * and answers within its own deadline (file mirror when the database is
 * slow); the catch is a last guard so a page never fails on the switch.
 */
async function switchedDown(): Promise<boolean> {
  try {
    return (await getGroundLink()).switchedUp === false;
  } catch {
    return false;
  }
}

/** The link for this request: ?link= (or the mission's own link), or no contact while the ground link is switched down. */
export async function effectiveLink(param?: string | string[] | null): Promise<EffectiveLink> {
  const resolved = currentLink(param);
  const groundLinkDown = await switchedDown();
  const profile = groundLinkDown ? groundLinkDownProfile(resolved.profile) : resolved.profile;
  return {
    profile,
    selected: resolved.selected,
    chosen: resolved.profile,
    policy: linkPolicy(profile.oneWayS),
    groundLinkDown,
  };
}
