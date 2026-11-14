import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, FileDown } from "lucide-react";
import { BASIS_INFO, BasisTag } from "@/components/guidance/basis";
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
import { PageHeader, StatusBadge, Tag, tagClass } from "@/components/ui";
import { currentMission } from "@/lib/config";
import { INTENDED_PURPOSE } from "@/lib/disclaimer";
import type { Basis } from "@/lib/health/knowledge";
import { ADMIN_HEADER, adminToken } from "@/lib/http";
import { CRITICAL_BAND_ESCALATION, withLink, type LinkMode } from "@/lib/link";
import { effectiveLink } from "@/lib/onboard/effective-link";
import { MAX_SCENARIO_MS } from "@/lib/store/scenarios";
import type { Status } from "@/lib/types";

export const metadata: Metadata = { title: "Help" };
// The alarm section shows the signal delay of ?link= (else the configured mission's).
export const dynamic = "force-dynamic";

const TOC = [
  { href: "#routine", label: "Daily routine" },
  { href: "#badges", label: "Colours and badges" },
  { href: "#alarms", label: "When an alarm sounds" },
  { href: "#drills", label: "Emergency drills" },
  { href: "#data", label: "Where the data comes from" },
  { href: "#onboard", label: "Onboard server and assistant" },
  { href: "#sensor", label: "Connecting a sensor" },
  { href: "#faq", label: "Questions" },
  { href: "#about", label: "About Demify" },
];

/**
 * curl example for the device API. With an admin token configured on this
 * server the request also needs the x-demify-admin header; the example names
 * the environment variable, never the token itself.
 */
function sensorExample(withToken: boolean): string {
  return [
    "curl -X POST http://localhost:3000/api/readings \\",
    "  -H 'content-type: application/json' \\",
    ...(withToken ? [`  -H "${ADMIN_HEADER}: $DEMIFY_ADMIN_TOKEN" \\`] : []),
    `  -d '[{"crewId":"cdr","indicator":"heartRate","value":64,"unit":"bpm","source":"sensor"},`,
    `       {"crewId":"cdr","indicator":"systolicBP","value":118,"unit":"mmHg","source":"sensor"}]'`,
  ].join("\n");
}

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

/** The five routine steps; in a blackout (no contact) step 5 prompts the onboard procedures, not a call. */
function routine(mode: LinkMode): { title: string; text: string; links: { href: string; label: string }[] }[] {
  const blackout = mode === "blackout";
  return [
    {
      title: "Check in every morning",
      text: "Enter vitals, sleep, mood and symptoms. Each value is rated as you type.",
      links: [{ href: "/check-in", label: "Check-in" }],
    },
    {
      title: "Read your ratings",
      text: "Nominal, caution or critical, against tagged reference ranges and your own pre-flight baseline.",
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
      title: "Practise the escalation",
      text: blackout
        ? "An escalation banner shows when an escalation rule is met; in a real mission it prompts the onboard procedures (no contact). In a real situation, never wait for it."
        : "An escalation banner shows when, in a real mission, the flight surgeon would be called. In a real situation, never wait for it.",
      links: [{ href: "/guidance#escalation", label: blackout ? "When to escalate" : "When to call" }],
    },
  ];
}

/** Status table; the critical row follows the link (CRITICAL_BAND_ESCALATION, shared with the check-in legend). */
function statusRows(mode: LinkMode): { status: Status; meaning: string; todo: string }[] {
  return [
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
      meaning: "In the critical band of the reference range.",
      todo: `Re-check and log. ${CRITICAL_BAND_ESCALATION[mode]}`,
    },
    {
      status: "unknown",
      meaning: "There is no reading to judge yet.",
      todo: "Measure it, or complete today's check-in.",
    },
  ];
}

const TAG_ROWS: { tag: ReactNode; name: string; meaning: string; dark?: boolean }[] = [
  {
    tag: <DrillTag label="Training scenario" />,
    name: "Drill",
    meaning: "A training drill is running. The alarm and values are simulated for practice; this is not a real emergency.",
  },
  {
    tag: <DemoTag />,
    name: "Demo",
    meaning: "The simulated training monitor: it shows how a bedside monitor would look and sound. Its alarms are training alarms.",
    dark: true,
  },
  {
    tag: <SimulatedTag />,
    name: "Simulated",
    meaning: "Generated by the demo simulator, not measured. A DEVICE reading or a crew entry replaces it.",
  },
  {
    tag: <SourceTag source="sensor" />,
    name: "Device",
    meaning: "Posted by a sensor or gateway to /api/readings.",
  },
  {
    tag: <SourceTag source="manual" />,
    name: "Crew entry",
    meaning: "Entered by you or a crewmate in the check-in.",
  },
  {
    tag: (
      <span className="flex flex-wrap gap-1">
        <Tag size="xs" className="text-fg">
          REAL
        </Tag>
        <Tag size="xs" className="border-caution/50 text-caution">
          SNAPSHOT 2026-11-14
        </Tag>
      </span>
    ),
    name: "Real or snapshot",
    meaning:
      "Space weather and NASA data: REAL is fetched from NOAA or NASA, shown with its fetch time. SNAPSHOT is the offline copy, shown with the date it was saved.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Why are some values simulated?",
    a: "There is no public real-time source of astronaut vital signs, because crew medical data is protected. Until a device is connected or the crew enters its own (labelled Crew entry), Demify generates plausible values around each crew member's baseline and labels them SIMULATED everywhere. Crew entries and DEVICE readings replace simulated values (for a vital sign while at most 6 h old, project rule).",
  },
  {
    q: "Can I use Demify for medical care?",
    a: "No. Demify is a research prototype and training simulation, not a certified medical device. It must not be used for the medical care of any individual. In a real situation follow your mission's medical procedures and contact your flight surgeon or emergency service.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. Every external source (NOAA, NASA OSDR) ships with a bundled snapshot. When a fetch fails, Demify falls back to that snapshot automatically. Each chart shows its source and a label: REAL with the fetch time, or SNAPSHOT with the date of the offline copy. Study search needs a connection; offline it shows the cached default list and a few example searches.",
  },
  {
    q: "What does Demo on the monitor mean?",
    a: "The bedside-style monitor on the Crew monitor page is a simulated training monitor and is permanently tagged Demo. It shows how a bedside monitor would look; its numbers are SIMULATED unless a sensor or gateway has posted DEVICE readings in the last two minutes.",
  },
  {
    q: "What is the difference between a drill and other alarms?",
    a: "A drill (training scenario) always carries the yellow Training scenario or Drill tag and only changes simulated telemetry. Every other alarm is a training alarm from the simulated monitor, raised by the values it shows. Practise the same steps for both. In a real mission (a future certified version) the same alarm would prompt these steps; in a real situation, if you are unsure, treat an alarm as real.",
  },
];

/** The printable user guide (public/docs/demify-user-guide.pdf). */
const USER_GUIDE_PDF = "/docs/demify-user-guide.pdf";

/** What the onboard assistant and library are, and how to read an answer. */
const ONBOARD_CARDS: { title: string; text: string; link?: { href: string; label: string } }[] = [
  {
    title: "Onboard assistant",
    text: "Ask a question in plain words. A library assistant (local language model) answers from the onboard library and nothing else, and says so when the library has no good answer instead of guessing. It never names medicines or doses, and it never raises or clears an alarm: the alarms and the response checklists stay primary. In an emergency, start the checklist before asking.",
    link: { href: "/assistant", label: "Onboard assistant" },
  },
  {
    title: "Onboard library",
    text: "A curated set of documents: procedures (drill checklists, escalation, signal delay and blackout), reference ranges, crew baselines and a representative medical-kit inventory of devices and supplies, without medicines. Each document names its source and review status (Project text, not clinically reviewed) and carries a version; every passage is checked against its checksum before the assistant uses it.",
    link: { href: "/library", label: "Onboard library" },
  },
  {
    title: "Citations and freshness",
    text: "Every answer cites the passages it used, numbered [1], [2], with the document they come from. It also says how fresh the library is, for example “last synced 14 hours ago”, and whether the ground link is up. Read the cited passages before you act on an answer.",
  },
];

/** What the simulated ground link switch changes. */
const GROUND_LINK_ROWS: { status: Status; name: string; meaning: string }[] = [
  {
    status: "nominal",
    name: "Ground link up",
    meaning:
      "Normal mode. On the onboard server the library syncs from the ground on a schedule and with Sync now; NOAA and NASA data are fetched when needed (REAL).",
  },
  {
    status: "caution",
    name: "Ground link down",
    meaning:
      "Simulated blackout. Every page behaves as under the Conjunction signal-delay profile: no contact, act on the onboard procedures, transmit when contact returns. NOAA and NASA data come from the last snapshots (SNAPSHOT), the library does not sync, and the assistant answers from the onboard copy (“Ask the flight surgeon when contact returns”).",
  },
];

/** Where Demify runs: the pitch laptop or the onboard server. */
const SETUP_ROWS: { name: string; meaning: string }[] = [
  {
    name: "Laptop mode",
    meaning:
      "The standard setup (docker-compose.yml or npm start): no database and no language model unless you set one up. The assistant searches the library bundled with Demify by keywords and shows the matching passages; with a local model configured (DEMIFY_MODEL_URL) the model writes the answer from those passages, with citations. The switch is stored in a file.",
  },
  {
    name: "Onboard server",
    meaning:
      "An NVIDIA DGX Spark (docker-compose.spark.yml): PostgreSQL with pgvector for readings and the library, a local model server, and a sync service that brings library updates and data snapshots from the ground while the link is up. It is a ground-test and analog-station setup; on a real spacecraft the same software would target an existing approved crew laptop or a hosted payload, not a new box. Demify does not connect to any ISS system.",
  },
];

/* ------------------------------------------------------------------------- */

export default async function HelpPage(props: PageProps<"/help">) {
  const sp = await props.searchParams;
  const mission = currentMission();
  const tokenSet = adminToken() != null;
  // ?link= swaps the signal delay like on the other pages (/help?link=conjunction shows the blackout text);
  // with the ground link switched down it is that blackout too (effectiveLink).
  const { profile: link, selected, policy, groundLinkDown } = await effectiveLink(sp.link);
  // The diagram node is narrow: the short name of the switch there.
  const linkName = groundLinkDown ? "Ground link down" : selected ? link.label : mission.name;
  const where = groundLinkDown
    ? link.label
    : selected
      ? `Signal delay profile ${link.label}`
      : `Current mission ${mission.name}`;
  // policy.label is formatDelay(oneWayS), or "no contact (blackout)".
  const delayText = policy.mode === "blackout" ? policy.label : `${policy.label} one-way`;
  const autoEndMin = Math.round(MAX_SCENARIO_MS / 60_000);

  return (
    <div className="space-y-12">
      <div>
        <PageHeader
          title="How to use Demify"
          description="The daily routine, what the colours mean, what to do when an alarm sounds and where the data comes from. No training needed: start with the routine below."
        >
          <a
            href={USER_GUIDE_PDF}
            download
            className="inline-flex shrink-0 items-center gap-2 rounded-[3px] border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FileDown size={16} aria-hidden />
            User guide (PDF)
          </a>
        </PageHeader>
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
        description="Five steps, most of them in the morning. Demify rates the values; you practise acting on what it shows."
      >
        <DailyRoutineDiagram mode={policy.mode} />
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {routine(policy.mode).map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <p className="flex items-start gap-2 text-sm font-semibold">
                <StepNumber n={i + 1} />
                {s.title}
              </p>
              <p className="flex-1 text-sm leading-relaxed text-muted">{s.text}</p>
              <p className="flex flex-wrap gap-1.5">
                {s.links.map((l) => (
                  <PageLink key={l.href} href={withLink(l.href, selected)}>
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
              {statusRows(policy.mode).map((r) => (
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
        description="Training alarms from the simulated training monitor appear in a bar at the top of every page. Follow the path below from the top."
      >
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
          <AlarmDecisionDiagram missionName={linkName} delayText={delayText} mode={policy.mode} />
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
                Red is high priority: act immediately. Amber is medium priority: check soon. The bar is tagged Training
                alarms, and alarms based on simulated telemetry also carry SIMULATED.
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
              className={`rounded-xl border p-4 ${policy.mode === "live" ? "border-border bg-surface" : "border-caution/50 bg-caution/5"}`}
            >
              <p className="font-semibold">
                {policy.mode === "blackout"
                  ? "No contact: act on the onboard procedures"
                  : policy.mode === "delayed"
                    ? "Act first, then transmit"
                    : "Call the flight surgeon directly"}
              </p>
              <p className="mt-1 leading-relaxed text-muted">
                {policy.mode === "blackout" ? `${where}: ${policy.label}.` : `${where}: signal delay ${delayText}.`}{" "}
                {policy.mode === "blackout"
                  ? "In a real mission: act on the onboard procedures, log readings and actions, and transmit everything when contact returns."
                  : policy.mode === "delayed"
                    ? "In a real mission: stabilise with the checklist, log readings and actions, then send everything in one message. Do not wait for the reply before treating."
                    : "The link is almost live. In a real mission, start the onboard emergency procedure first; the call must never delay treatment."}
              </p>
              <p className="mt-2">
                <PageLink href={withLink("/guidance#escalation", selected)}>Escalation protocol</PageLink>
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
                <Link href={withLink("/crew", selected)} className="font-medium text-accent underline-offset-2 hover:underline">
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
        description="Space weather and NASA research data are REAL, or a dated SNAPSHOT when offline. Vital signs and check-in values are SIMULATED until a DEVICE or the crew provides real ones, and are labelled that way."
      >
        <DataFlowDiagram />
      </Section>

      {/* Onboard server and assistant ------------------------------------- */}
      <Section
        id="onboard"
        title="Onboard server and assistant"
        description="The onboard assistant answers crew questions from a curated onboard library, in laptop mode or on an optional onboard server. It advises, never decides: the crew and, when the ground link is up, the flight surgeons make every medical decision."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <ul className="space-y-3 text-sm">
            {ONBOARD_CARDS.map((c) => (
              <li key={c.title} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold">{c.title}</p>
                <p className="mt-1 leading-relaxed text-muted">{c.text}</p>
                {c.link && (
                  <p className="mt-2">
                    <PageLink href={withLink(c.link.href, selected)}>{c.link.label}</PageLink>
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Ground link up or down</h3>
              <ul className="divide-y divide-border">
                {GROUND_LINK_ROWS.map((r) => (
                  <li key={r.name} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[150px_1fr]">
                    <span>
                      <StatusBadge status={r.status} label={r.name} />
                    </span>
                    <span className="leading-relaxed text-muted">{r.meaning}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-muted">
                The switch (Simulated ground link: Up or Down (blackout)) is on the Assistant and Library pages. On a
                server with an admin token, a browser must be unlocked to move it (see{" "}
                <a href="#admin-token" className="font-medium text-accent underline-offset-2 hover:underline">
                  admin token
                </a>
                ). Air-gapped mode (<span className="text-fg">DEMIFY_OFFLINE=true</span>) is not a blackout: no
                external data is fetched, but the pages keep their wording.
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Laptop mode or onboard server</h3>
              <ul className="divide-y divide-border">
                {SETUP_ROWS.map((r) => (
                  <li key={r.name} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[150px_1fr]">
                    <span className="font-semibold">{r.name}</span>
                    <span className="leading-relaxed text-muted">{r.meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* Sensor ------------------------------------------------------------ */}
      <Section
        id="sensor"
        title="Connecting a real sensor"
        description="Any device or ground relay can send readings to Demify. DEVICE readings replace the SIMULATED ones straight away."
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <CopyCode code={sensorExample(tokenSet)} label="Send two readings for the commander" />
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <ul className="list-disc space-y-1.5 pl-5 leading-relaxed text-muted marker:text-muted">
              <li>
                <span className="text-fg">unit</span> must match the indicator&apos;s unit exactly, and{" "}
                <span className="text-fg">value</span> must be plausible; otherwise the request is refused.
              </li>
              <li>Send JSON, up to 500 readings and 1 MB per request.</li>
              <li>Readings dated more than 5 minutes in the future are rejected.</li>
              <li id="admin-token" className="scroll-mt-20">
                {tokenSet ? "This server has an admin token set" : "If the server has an admin token set"} (
                <span className="text-fg">DEMIFY_ADMIN_TOKEN</span>): scripts and devices send it in the{" "}
                <span className="text-fg">{ADMIN_HEADER}</span> header
                {tokenSet ? " (included in the example)" : ""}. To start drills from a browser, open{" "}
                <span className="text-fg">/unlock?token=…</span> once in that browser; ask the operator for the token.
              </li>
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

      {/* About ------------------------------------------------------------- */}
      <Section id="about" title="About Demify" description="What Demify is for, and what it must not be used for.">
        <div className="max-w-3xl space-y-3 rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed md:p-5">
          <h3 className="text-sm font-semibold">Intended purpose</h3>
          <p>{INTENDED_PURPOSE}</p>
        </div>
      </Section>
    </div>
  );
}
