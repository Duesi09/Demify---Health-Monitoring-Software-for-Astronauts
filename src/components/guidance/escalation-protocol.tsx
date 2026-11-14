import { CircleCheck, Lock, PhoneCall, Satellite, Send, Siren, Stethoscope, type LucideIcon } from "lucide-react";
import { INDICATORS } from "@/lib/health/knowledge";
import type { MissionProfile, Status } from "@/lib/types";
import { escalationThreshold } from "./format";

interface Tier {
  status: Status;
  icon: LucideIcon;
  when: string;
  title: string;
  body: string;
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
    body: "Any indicator Demify marks Critical, or any value crossing an escalation threshold in the table below. The Body Map shows a red “Contact the flight surgeon” callout when this applies.",
  },
  {
    status: "caution",
    icon: Stethoscope,
    when: "Next conference",
    title: "Report at the next private medical conference",
    body: "A Caution that persists for more than a day after the crew actions, several Cautions in the same body system, or a steady trend away from your pre-flight baseline. Mood or stress concerns go to a private psychological conference.",
  },
  {
    status: "nominal",
    icon: CircleCheck,
    when: "Routine",
    title: "Self-manage and keep logging",
    body: "Everything Nominal: keep the daily check-in, countermeasure exercise and the full sleep period. Your history is what makes the next decision accurate.",
  },
];

const TONE: Record<Status, { ring: string; text: string; bg: string }> = {
  critical: { ring: "border-critical/40", text: "text-critical", bg: "bg-critical/10" },
  caution: { ring: "border-caution/40", text: "text-caution", bg: "bg-caution/10" },
  nominal: { ring: "border-nominal/40", text: "text-nominal", bg: "bg-nominal/10" },
  unknown: { ring: "border-border", text: "text-muted", bg: "bg-surface-2" },
};

export function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds.toLocaleString("en-US", { maximumFractionDigits: 1 })} s`;
  return `${(seconds / 60).toLocaleString("en-US", { maximumFractionDigits: 1 })} min`;
}

export function EscalationProtocol() {
  return (
    <div className="space-y-4">
      <ol className="grid gap-3 md:grid-cols-2">
        {TIERS.map((t, i) => {
          const tone = TONE[t.status];
          const Icon = t.icon;
          return (
            <li key={t.title} className={`flex gap-3 rounded-xl border bg-surface p-4 ${tone.ring}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.bg} ${tone.text}`}>
                <Icon size={17} aria-hidden />
              </span>
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${tone.text}`}>
                  {i + 1}. {t.when}
                </p>
                <h3 className="text-sm font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted">{t.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="border-b border-border px-4 py-3 text-left text-xs text-muted">
            Escalation rules per indicator. “Automatic flag” values make Demify mark the reading for escalation; the
            rule text also covers symptoms and trends that only you can judge.
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
                <td className="whitespace-nowrap px-4 py-2 tabular text-critical">{escalationThreshold(d) ?? "—"}</td>
                <td className="px-4 py-2 text-muted">{d.escalation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-surface md:hidden">
        <p className="border-b border-border px-4 py-3 text-xs text-muted">
          Escalation rules per indicator. Red values are automatic flags; the rule text also covers symptoms and trends
          that only you can judge.
        </p>
        <ul>
          {Object.values(INDICATORS).map((d) => {
            const flag = escalationThreshold(d);
            return (
              <li key={d.id} className="border-t border-border px-4 py-2.5 first:border-t-0">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <a href={`#ind-${d.id}`} className="font-medium hover:text-accent">
                    {d.short}
                  </a>
                  {flag && <span className="tabular text-xs text-critical">{flag}</span>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{d.escalation}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function CommDelay({ mission, profiles }: { mission: MissionProfile; profiles: MissionProfile[] }) {
  const autonomous = mission.commDelaySeconds >= 60;
  return (
    <section className="rounded-xl border border-border bg-surface p-4 md:p-5" aria-labelledby="comm-delay-title">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Satellite size={17} aria-hidden />
        </span>
        <div>
          <h3 id="comm-delay-title" className="text-sm font-semibold">
            Communication delay
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            Current mission <span className="text-fg">{mission.name}</span>: one-way{" "}
            <span className="tabular text-fg">{formatDelay(mission.commDelaySeconds)}</span>, round trip{" "}
            <span className="tabular text-fg">{formatDelay(mission.commDelaySeconds * 2)}</span>.
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-1.5 text-sm">
        {profiles.map((p) => (
          <li
            key={p.id}
            className={`flex items-center justify-between gap-3 rounded-md px-3 py-1.5 ${
              p.id === mission.id ? "bg-accent/10 text-fg" : "text-muted"
            }`}
          >
            <span>
              {p.name}
              {p.id === mission.id && <span className="ml-2 text-[11px] text-accent">current</span>}
            </span>
            <span className="tabular">{formatDelay(p.commDelaySeconds)} one-way</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-muted">
          <span>Mars, far side of the Sun</span>
          <span className="tabular">up to ~20 min one-way</span>
        </li>
      </ul>

      <div className={`mt-4 rounded-lg border p-3.5 ${autonomous ? "border-caution/40 bg-caution/5" : "border-border bg-surface-2/40"}`}>
        <p className={`text-sm font-semibold ${autonomous ? "text-caution" : ""}`}>
          {autonomous ? "Act first, then transmit" : "Near real-time link: call directly"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {autonomous
            ? "A question and its answer take a long time to travel. Do not wait for the ground before treating:"
            : "You can talk to the flight surgeon almost live. On a Mars mission, where one-way delay reaches 20 minutes, the order reverses:"}
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
    </section>
  );
}

export function PrivateConferences() {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 md:p-5" aria-labelledby="pmc-title">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-2/10 text-accent-2">
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
            crew conflict; a mood score of 2 or less, or any thought of self-harm, warrants requesting one now.
          </span>
        </p>
        <p className="text-xs text-muted">
          What you share in these conferences stays between you and the medical team.
        </p>
      </div>
    </section>
  );
}
