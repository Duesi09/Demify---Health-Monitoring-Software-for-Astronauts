import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { BASIS_INFO, BasisTag } from "@/components/guidance/basis";
import { formatDelay } from "@/components/guidance/escalation-protocol";
import { DRILL_BUTTONS } from "@/components/crew/protocols";
import { CopyCode } from "@/components/help/copy-code";
import {
  AlarmDecisionDiagram,
  DailyRoutineDiagram,
  DataFlowDiagram,
  DrillTimelineDiagram,
} from "@/components/help/diagrams";
import { DemoTag } from "@/components/monitor/shared";
import { DrillTag, SimulatedTag, SourceTag } from "@/components/overview/status-icon";
import { PageHeader, StatusBadge, tagClass } from "@/components/ui";
import { currentMission } from "@/lib/config";
import type { Basis } from "@/lib/health/knowledge";
import { MAX_SCENARIO_MS } from "@/lib/store/scenarios";
import type { Status } from "@/lib/types";

export const metadata: Metadata = { title: "Help" };
// The alarm section shows the configured mission's signal delay.
export const dynamic = "force-dynamic";

const TOC = [
  { href: "#routine", label: "Daily routine" },
  { href: "#badges", label: "Colours and badges" },
  { href: "#alarms", label: "When an alarm sounds" },
  { href: "#drills", label: "Emergency drills" },
  { href: "#data", label: "Where the data comes from" },
  { href: "#sensor", label: "Connecting a sensor" },
  { href: "#faq", label: "Questions" },
];

const SENSOR_EXAMPLE = `curl -X POST http://localhost:3000/api/readings \\
  -H 'content-type: application/json' \\
  -d '[{"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"},
       {"crewId":"cdr","indicator":"systolicBP","value":118,"unit":"mmHg","source":"sensor"}]'`;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-4">
        <h2 id={id} className="scroll-mt-20 text-[22px] font-semibold leading-tight tracking-[-0.018em]">
          {title}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-fg text-[11px] font-semibold text-bg tabular"
    >
      {n}
    </span>
  );
}

function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${tagClass("md", true)} gap-1`}>
      {children}
      <ChevronRight size={12} aria-hidden />
    </Link>
  );
}

/* ------------------------------------------------------------------------- */

const ROUTINE: { title: string; text: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Check in every morning",
    text: "Enter vitals, sleep, mood and symptoms. Each value is rated as you type.",
    links: [{ href: "/check-in", label: "Check-in" }],
  },
  {
    title: "Read your ratings",
    text: "Nominal, caution or critical, against NASA and clinical ranges and your own pre-flight baseline.",
    links: [{ href: "/guidance#reference", label: "Indicator ranges" }],
  },
  {
    title: "See what needs attention",
    text: "The Overview shows every crew member; the Body map shows which body system is affected.",
    links: [
      { href: "/", label: "Overview" },
      { href: "/body", label: "Body map" },
    ],
  },
  {
    title: "Follow the actions",
    text: "Every finding lists what to do now. The Crew monitor has the full record and trends.",
    links: [{ href: "/crew", label: "Crew monitor" }],
  },
  {
    title: "Escalate when told",
    text: "An escalation banner means: involve the flight surgeon. Never wait for it if you feel unwell.",
    links: [{ href: "/guidance#escalation", label: "When to call" }],
  },
];

const STATUS_ROWS: { status: Status; meaning: string; todo: string }[] = [
  {
    status: "nominal",
    meaning: "Inside the normal range and close to your pre-flight baseline.",
    todo: "Nothing extra. Keep the routine.",
  },
  {
    status: "caution",
    meaning: "Outside the normal range, or 25 % or more away from your own baseline.",
    todo: "Follow the listed actions, re-measure and watch the trend.",
  },
  {
    status: "critical",
    meaning: "Outside the safe range, or past an indicator's escalation limit.",
    todo: "Act now and contact the flight surgeon; Demify raises an escalation.",
  },
  {
    status: "unknown",
    meaning: "There is no reading to judge yet.",
    todo: "Measure it, or complete today's check-in.",
  },
];

const TAG_ROWS: { tag: ReactNode; name: string; meaning: string; dark?: boolean }[] = [
  {
    tag: <DrillTag label="Training scenario" />,
    name: "Drill",
    meaning: "A training drill is running. The alarm and values are simulated for practice; this is not a real emergency.",
  },
  {
    tag: <DemoTag />,
    name: "Demo",
    meaning: "The live patient monitor is a demonstration of a bedside monitor, not a medical device.",
    dark: true,
  },
  {
    tag: <SimulatedTag />,
    name: "Simulated",
    meaning: "Generated by the demo simulator, not measured. A real sensor or crew entry replaces it.",
  },
  {
    tag: <SourceTag source="manual" />,
    name: "Crew entry",
    meaning: "Entered by you or a crewmate in the check-in.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Why are some values simulated?",
    a: "There is no public real-time source of astronaut vital signs, because crew medical data is protected. Until a device is connected or you enter your own values, Demify generates plausible values around each crew member's baseline and labels them simulated everywhere. Real sensor and crew entries always replace them.",
  },
  {
    q: "Is Demify a medical device?",
    a: "No. Demify is decision support and a training tool. It helps you notice changes early and act on published guidance. Flight surgeons are the medical authority; follow the onboard medical procedures and their instructions over anything shown here.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. Every external source (NOAA, NASA OSDR) ships with a bundled snapshot. Demify falls back from live data to cached data to that snapshot automatically, and each chart shows its source and whether it is live, cached or an offline snapshot.",
  },
  {
    q: "What does Demo on the monitor mean?",
    a: "The bedside-style patient monitor on the Crew monitor page is permanently tagged Demo. It shows how a live monitor would look; its numbers come from the simulator unless a sensor has sent readings in the last two minutes. It is not a medical device.",
  },
  {
    q: "What is the difference between a drill and a real alarm?",
    a: "A drill always carries the yellow Training scenario or Drill tag and only changes simulated telemetry. A real alarm has no such tag. If you are unsure, treat it as real.",
  },
];

/* ------------------------------------------------------------------------- */

export default function HelpPage() {
  const mission = currentMission();
  const autonomous = mission.commDelaySeconds >= 60;
  const autoEndMin = Math.round(MAX_SCENARIO_MS / 60_000);

  return (
    <div className="space-y-12">
      <div>
        <PageHeader
          title="How to use Demify"
          description="The daily routine, what the colours mean, what to do when an alarm sounds and where the data comes from. No training needed: start with the routine below."
        />
        <nav aria-label="On this page" className="flex flex-wrap gap-1.5">
          {TOC.map((t) => (
            <a key={t.href} href={t.href} className={tagClass("md", true)}>
              {t.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Daily routine ----------------------------------------------------- */}
      <Section
        id="routine"
        title="Your daily routine"
        description="Five steps, most of them in the morning. Demify does the rating; you act on what it shows."
      >
        <DailyRoutineDiagram />
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {ROUTINE.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <p className="flex items-start gap-2 text-sm font-semibold">
                <StepNumber n={i + 1} />
                {s.title}
              </p>
              <p className="flex-1 text-sm leading-relaxed text-muted">{s.text}</p>
              <p className="flex flex-wrap gap-1.5">
                {s.links.map((l) => (
                  <PageLink key={l.href} href={l.href}>
                    {l.label}
                  </PageLink>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Colours and badges ------------------------------------------------ */}
      <Section
        id="badges"
        title="What the colours and badges mean"
        description="Every status has its own shape as well as its colour, so it reads the same in any light."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Status of a value</h3>
            <div className="hidden grid-cols-[110px_1fr_1fr] gap-4 border-b border-border bg-surface-2/60 px-4 py-2 text-xs font-medium text-muted sm:grid">
              <span>Badge</span>
              <span>Meaning</span>
              <span>What to do</span>
            </div>
            <ul className="divide-y divide-border">
              {STATUS_ROWS.map((r) => (
                <li key={r.status} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[110px_1fr_1fr]">
                  <span>
                    <StatusBadge status={r.status} size="md" />
                  </span>
                  <span className="leading-relaxed">{r.meaning}</span>
                  <span className="leading-relaxed text-muted">
                    <span className="sr-only">What to do: </span>
                    {r.todo}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Tags next to values</h3>
            <ul className="divide-y divide-border">
              {TAG_ROWS.map((r) => (
                <li key={r.name} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[150px_1fr]">
                  <span>
                    {r.dark ? (
                      <span className="inline-flex rounded-[4px] bg-[#0b0d12] p-1.5" title="As it appears on the dark monitor">
                        {r.tag}
                      </span>
                    ) : (
                      r.tag
                    )}
                  </span>
                  <span className="leading-relaxed">
                    <span className="font-semibold">{r.name}. </span>
                    <span className="text-muted">{r.meaning}</span>
                  </span>
                </li>
              ))}
              <li className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[150px_1fr]">
                <span className="flex flex-wrap items-start gap-1">
                  {(Object.keys(BASIS_INFO) as Basis[]).map((b) => (
                    <BasisTag key={b} basis={b} />
                  ))}
                </span>
                <span className="leading-relaxed">
                  <span className="font-semibold">Range basis. </span>
                  <span className="text-muted">
                    Where a range comes from: a NASA standard, a general clinical guideline, or a band derived by
                    Demify (treat that one as a prompt to look closer).
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Alarms ------------------------------------------------------------ */}
      <Section
        id="alarms"
        title="When an alarm sounds"
        description="Alarms appear in a bar at the top of every page. Follow the path below from the top."
      >
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
          <AlarmDecisionDiagram
            missionName={mission.name}
            delayText={formatDelay(mission.commDelaySeconds)}
            autonomous={autonomous}
          />
          <ul className="space-y-3 text-sm">
            <li className="rounded-xl border border-border bg-surface p-4">
              <p className="font-semibold">Turn the sound on once</p>
              <p className="mt-1 leading-relaxed text-muted">
                Browsers keep a page silent until you click or press a key. When the alarm bar shows{" "}
                <span className="font-medium text-fg">Enable alarm sound</span>, press it. Your Sound on or off choice is
                remembered in this browser; after a reload, the first click turns sound back on.
              </p>
            </li>
            <li className="rounded-xl border border-border bg-surface p-4">
              <p className="font-semibold">Red or yellow</p>
              <p className="mt-1 leading-relaxed text-muted">
                Red is high priority: act immediately. Amber is medium priority: check soon. Alarms based on simulated
                telemetry say so in the bar.
              </p>
            </li>
            <li className="rounded-xl border border-border bg-surface p-4">
              <p className="font-semibold">Silence 2 min</p>
              <p className="mt-1 leading-relaxed text-muted">
                Pauses the sound only, after you have started acting. The bar stays on screen, and a new alarm ends the
                silence at once.
              </p>
            </li>
            <li
              className={`rounded-xl border p-4 ${autonomous ? "border-caution/50 bg-caution/5" : "border-border bg-surface"}`}
            >
              <p className="font-semibold">
                {autonomous ? "Act first, then transmit" : "Call the flight surgeon directly"}
              </p>
              <p className="mt-1 leading-relaxed text-muted">
                Current mission {mission.name}: signal delay {formatDelay(mission.commDelaySeconds)} one-way.{" "}
                {autonomous
                  ? "Stabilise with the checklist, log readings and actions, then send everything in one message. Do not wait for the reply before treating."
                  : "The link is almost live. Start the onboard emergency procedure first; the call must never delay treatment."}
              </p>
              <p className="mt-2">
                <PageLink href="/guidance#escalation">Escalation protocol</PageLink>
              </p>
            </li>
          </ul>
        </div>
      </Section>

      {/* Drills ------------------------------------------------------------ */}
      <Section
        id="drills"
        title="Running an emergency drill"
        description="Drills let the crew rehearse a medical emergency. They change only simulated telemetry and are always labelled as a training scenario."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <ol className="space-y-3 text-sm">
            {[
              <>
                Open the{" "}
                <Link href="/crew" className="font-medium text-accent underline-offset-2 hover:underline">
                  Crew monitor
                </Link>{" "}
                and choose the crew member.
              </>,
              <>
                Under <span className="font-medium">Emergency drill</span>, pick a scenario and confirm with{" "}
                <span className="font-medium">Yes, start drill</span>.
              </>,
              <>Work through the response checklist that opens next to it, as you would for real.</>,
              <>
                Press <span className="font-medium">End drill</span> when you are done. A forgotten drill ends by itself
                after {autoEndMin} minutes.
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <StepNumber n={i + 1} />
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <h3 className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              What you will see <DrillTag label="Drill" />
            </h3>
            <ul className="divide-y divide-border">
              {DRILL_BUTTONS.map((b) => (
                <li key={b.type} className="px-4 py-3 text-sm">
                  <p className="font-medium">{b.label}</p>
                  <p className="mt-0.5 leading-relaxed text-muted">{b.effect}</p>
                </li>
              ))}
              <li className="px-4 py-3 text-sm leading-relaxed text-muted">
                In every drill, every page shows red alarms for that crew member, labelled{" "}
                <span className="font-medium text-fg">Drill</span> or{" "}
                <span className="font-medium text-fg">Training scenario</span>.
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-4">
          <DrillTimelineDiagram autoEndMin={autoEndMin} />
        </div>
      </Section>

      {/* Data sources ------------------------------------------------------ */}
      <Section
        id="data"
        title="Where the data comes from"
        description="Space weather and NASA research data are real. Vital signs and check-in values are simulated until a device or the crew provides real ones, and are labelled that way."
      >
        <DataFlowDiagram />
      </Section>

      {/* Sensor ------------------------------------------------------------ */}
      <Section
        id="sensor"
        title="Connecting a real sensor"
        description="Any device or ground relay can send readings to Demify. Real readings replace the simulated ones straight away."
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <CopyCode code={SENSOR_EXAMPLE} label="Send two readings for the commander" />
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted marker:text-muted">
              <li>
                <span className="text-fg">unit</span> must match the indicator&apos;s unit exactly, and{" "}
                <span className="text-fg">value</span> must be plausible; otherwise the request is refused.
              </li>
              <li>Send JSON, up to 500 readings and 1 MB per request.</li>
              <li>Readings dated more than 5 minutes in the future are rejected.</li>
            </ul>
            <p className="mt-3 leading-relaxed">
              Replace <code className="rounded-[3px] bg-surface-2 px-1 py-0.5 font-mono text-[12.5px]">localhost:3000</code>{" "}
              with the address of your Demify server. All indicator ids, units, endpoints and setup steps: see the
              operations handbook in the repository,{" "}
              <code className="rounded-[3px] bg-surface-2 px-1 py-0.5 font-mono text-[12.5px]">docs/OPERATIONS.md</code>{" "}
              (section 4, connecting a sensor).
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ --------------------------------------------------------------- */}
      <Section id="faq" title="Questions" description="Short answers to what crews ask most.">
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {FAQ.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-90" />
              </summary>
              <p className="max-w-3xl px-4 pb-4 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </div>
  );
}
