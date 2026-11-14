import { CircleCheck, Lock, PhoneCall, Satellite, Send, Siren, Stethoscope, type LucideIcon } from "lucide-react";
import { INDICATORS, bandEscalationLabel, escalationFlags, type IndicatorDef } from "@/lib/health/knowledge";
import { LINK_PROFILES, LINK_PROFILE_IDS, MARS_DELAY_RANGE, linkPolicy, type LinkProfile } from "@/lib/link";
import type { Status } from "@/lib/types";
import { StatusBadge, Tag } from "@/components/ui";

interface Tier {
  status: Status;
  icon: LucideIcon;
  when: string;
  title: string;
  body: string;
}

/** "Temperature" -> "temperature"; names like "SpO₂" or "ST segment" stay as they are. */
function inSentence(name: string): string {
  return /^[A-Z][a-z]+( [a-z]+)*$/.test(name) ? name.toLowerCase() : name;
}

/** "a, b or c" (or "a; b; or c" with sep "; "). */
function listText(items: string[], sep = ", "): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(sep)}${sep === ", " ? " " : sep}or ${items.at(-1)}`;
}

/**
 * Tier 2 text, generated from the same rule fields as the table below
 * (escalateFromBand, persistence, stormAlert), so the summary cannot drift
 * from what the code flags.
 */
function automaticFlagSummary(): string {
  const defs: IndicatorDef[] = Object.values(INDICATORS);
  const parts = ["one value beyond an escalation limit"];
  const critical = defs.filter((d) => d.escalateFromBand === "critical").map((d) => inSentence(d.short));
  if (critical.length) parts.push(`any critical ${listText(critical)} value`);
  for (const d of defs.filter((x) => x.escalateFromBand === "caution")) {
    parts.push(`any ${inSentence(d.short)} value ${bandEscalationLabel(d)}`);
  }
  if (defs.some((d) => d.persistence)) parts.push("a value repeated for the stated days or hours");
  if (defs.some((d) => d.stormAlert)) parts.push("a current solar radiation storm alert (NOAA S1 or higher)");
  return `Any reading that meets an automatic flag in the table below: ${listText(parts, "; ")}. The Body Map shows a red “Contact the flight surgeon” callout when this applies.`;
}

const TIERS: Tier[] = [
  {
    status: "critical",
    icon: Siren,
    when: "Emergency",
    title: "Act immediately, then call",
    body: "Chest pain, fainting or loss of consciousness, severe shortness of breath, sudden vision loss, a sudden severe headache, or any thought of self-harm. Start the onboard emergency procedure first; the call must not delay treatment.",
  },
  {
    status: "critical",
    icon: PhoneCall,
    when: "Now",
    title: "Contact the flight surgeon",
    body: automaticFlagSummary(),
  },
  {
    status: "caution",
    icon: Stethoscope,
    when: "Next conference",
    title: "Report at the next private medical conference",
    body: "A Critical value without an automatic flag that stays there after re-checking, a Caution that persists for more than a day after the crew actions, several Cautions in the same body system, or a steady trend away from your pre-flight baseline. Mood or stress concerns go to a private psychological conference.",
  },
  {
    status: "nominal",
    icon: CircleCheck,
    when: "Routine",
    title: "Self-manage and keep logging",
    body: "Everything Nominal: keep the daily check-in, countermeasure exercise and the full sleep period. Your history is what makes the next decision accurate.",
  },
];

const ICON_TILE = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-fg";

/** Keeps "≤ 35.0 °C" or "2 days" on one line: no-break space after a number or a comparison sign. */
function keepTogether(text: string): string {
  return text.replace(/([\d<>≤≥]) /g, "$1\u00a0");
}

/** Automatic flags of one indicator, one per line ("—" when it has none). */
function FlagList({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="text-muted">—</span>;
  return (
    <ul className="space-y-0.5">
      {flags.map((f) => (
        <li key={f} className="text-balance">
          {keepTogether(f)}
        </li>
      ))}
    </ul>
  );
}

/** The one delay formatter lives in src/lib/link.ts; re-exported for existing importers (/help). */
export { formatDelay } from "@/lib/link";

export function EscalationProtocol() {
  return (
    <div className="space-y-4">
      <ol className="grid gap-3 md:grid-cols-2">
        {TIERS.map((t, i) => {
          const Icon = t.icon;
          return (
            <li key={t.title} className="flex gap-3 rounded-xl border border-border bg-surface p-4 md:p-5">
              <span className={ICON_TILE}>
                <Icon size={17} aria-hidden />
              </span>
              <div>
                <StatusBadge status={t.status} size="xs" label={`${i + 1} · ${t.when}`} />
                <h3 className="mt-1.5 text-sm font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted">{t.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="border-b border-border px-4 py-3 text-left text-xs text-muted">
            Escalation rules per indicator. “Automatic flag” values make Demify mark the reading for escalation; a
            Critical band alone does not. Rules with days or hours need repeated values. The rule text also covers
            symptoms that only you can judge.
          </caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-normal">Indicator</th>
              <th scope="col" className="px-4 py-2 font-normal">Automatic flag</th>
              <th scope="col" className="px-4 py-2 font-normal">Escalate when</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(INDICATORS).map((d) => (
              <tr key={d.id} className="border-t border-border align-top">
                <th scope="row" className="px-4 py-2 font-medium">
                  <a href={`#ind-${d.id}`} className="hover:text-accent">
                    {d.short}
                  </a>
                </th>
                <td className="px-4 py-2 tabular text-critical">
                  <FlagList flags={escalationFlags(d)} />
                </td>
                <td className="px-4 py-2 text-muted">{d.escalation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-surface md:hidden">
        <p className="border-b border-border px-4 py-3 text-xs text-muted">
          Escalation rules per indicator. Values marked “Flag” are automatic flags; a Critical band alone is not.
          Rules with days or hours need repeated values. The rule text also covers symptoms that only you can judge.
        </p>
        <ul>
          {Object.values(INDICATORS).map((d) => {
            const flags = escalationFlags(d);
            return (
              <li key={d.id} className="border-t border-border px-4 py-2.5 first:border-t-0">
                <p className="text-sm">
                  <a href={`#ind-${d.id}`} className="font-medium hover:text-accent">
                    {d.short}
                  </a>
                </p>
                {flags.length > 0 && (
                  <p className="mt-0.5 tabular text-xs text-critical">
                    <span className="font-medium text-muted">Flag </span>
                    {keepTogether(flags.join("; "))}
                  </p>
                )}
                <p className="mt-0.5 text-sm text-muted">{d.escalation}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Signal delay for the selected link profile (?link=, else the mission's
 * own), every profile for comparison, and what the crew does under it
 * (linkPolicy: live, delayed or blackout).
 */
export function CommDelay({ link, missionName }: { link: LinkProfile; missionName: string }) {
  const policy = linkPolicy(link.oneWayS);
  return (
    <section className="rounded-xl border border-border bg-surface p-4 md:p-5" aria-labelledby="comm-delay-title">
      <header className="flex items-start gap-3">
        <span className={ICON_TILE}>
          <Satellite size={17} aria-hidden />
        </span>
        <div>
          <h3 id="comm-delay-title" className="text-sm font-semibold">
            Communication delay
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            Current mission <span className="text-fg">{missionName}</span>, signal delay profile{" "}
            <span className="text-fg">{link.label}</span>:{" "}
            {policy.mode === "blackout" ? (
              <span className="text-fg">{policy.label}</span>
            ) : (
              <>
                one-way <span className="tabular text-fg">{policy.label}</span>, round trip{" "}
                <span className="tabular text-fg">{policy.roundTripLabel}</span>
              </>
            )}
            .
          </p>
          <p className="mt-1 text-xs text-muted">Basis: {link.basis}.</p>
        </div>
      </header>

      <ul className="mt-4 space-y-1.5 text-sm">
        {LINK_PROFILE_IDS.map((id) => {
          const p = LINK_PROFILES[id];
          const pp = linkPolicy(p.oneWayS);
          const current = id === link.id;
          return (
            <li
              key={id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 ${
                current ? "bg-surface-2 text-fg" : "text-muted"
              }`}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {p.label}
                {current && <Tag size="xs">Current</Tag>}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular">
                {pp.mode === "blackout" ? pp.label : `${pp.label} one way`}
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-muted">
          <span>Mars in general</span>
          <span className="shrink-0 text-right">{MARS_DELAY_RANGE}</span>
        </li>
      </ul>

      {policy.mode === "blackout" ? (
        <div className="mt-4 rounded-lg border border-caution/40 bg-caution/5 p-3.5">
          <p className="text-sm font-semibold text-caution">No contact: act on the onboard procedures</p>
          <p className="mt-1 text-sm text-muted">
            There is no link to the ground until contact returns. Act on the onboard procedures; transmit when contact
            returns:
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm marker:text-muted">
            <li>Stabilise using the crew actions in this guide and the onboard procedures.</li>
            <li>Re-measure and log the readings, symptoms, time and every action taken.</li>
            <li>Prepare the data package for the flight surgeon; transmit it when contact returns.</li>
            <li>Keep monitoring on schedule and keep the log going until the link is back.</li>
          </ol>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Send size={12} aria-hidden /> NASA’s distance-from-Earth hazard: crews must be able to diagnose and treat
            themselves.
          </p>
        </div>
      ) : (
        <div
          className={`mt-4 rounded-lg border p-3.5 ${policy.mode === "delayed" ? "border-caution/40 bg-caution/5" : "border-border bg-surface-2/40"}`}
        >
          <p className={`text-sm font-semibold ${policy.mode === "delayed" ? "text-caution" : ""}`}>
            {policy.mode === "delayed" ? "Act first, then transmit" : "Near real-time link: call directly"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {policy.mode === "delayed"
              ? "A question and its answer take a long time to travel. Do not wait for the ground before treating:"
              : `You can talk to the flight surgeon almost live. On a Mars mission, where the delay is ${MARS_DELAY_RANGE}, the order reverses:`}
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm marker:text-muted">
            <li>Stabilise using the crew actions in this guide and the onboard procedures.</li>
            <li>Re-measure and log the readings, symptoms, time and every action taken.</li>
            <li>Transmit the data package to the flight surgeon in one message.</li>
            <li>Keep monitoring on schedule; send updates, do not sit idle waiting for the reply.</li>
          </ol>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Send size={12} aria-hidden /> NASA’s distance-from-Earth hazard: crews must be able to diagnose and treat
            themselves.
          </p>
        </div>
      )}
    </section>
  );
}

export function PrivateConferences() {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 md:p-5" aria-labelledby="pmc-title">
      <header className="flex items-start gap-3">
        <span className={ICON_TILE}>
          <Lock size={17} aria-hidden />
        </span>
        <div>
          <h3 id="pmc-title" className="text-sm font-semibold">
            Private medical &amp; psychological conferences
          </h3>
          <p className="mt-0.5 text-sm text-muted">Confidential channels, separate from mission operations.</p>
        </div>
      </header>
      <div className="mt-4 space-y-3 text-sm">
        <p>
          <span className="font-medium">Private Medical Conference (PMC):</span>{" "}
          <span className="text-muted">
            a regularly scheduled, private call between each crew member and their flight surgeon. Bring trends and
            Cautions from Demify here; you can also request an unscheduled one at any time.
          </span>
        </p>
        <p>
          <span className="font-medium">Private Psychological Conference (PPC):</span>{" "}
          <span className="text-muted">
            a private session with behavioural health specialists. Use it for low mood, high stress, sleep trouble or
            crew conflict; a mood score of 2 or less on two days in a row, or any thought of self-harm, warrants
            requesting one now.
          </span>
        </p>
        <p className="text-xs text-muted">
          What you share in these conferences stays between you and the medical team.
        </p>
      </div>
    </section>
  );
}
