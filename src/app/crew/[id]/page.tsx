import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ClipboardPlus, PersonStanding } from "lucide-react";
import { CrewSwitcher } from "@/components/crew-switcher";
import { CrewTrends } from "@/components/crew/crew-trends";
import { EmergencyConsole } from "@/components/crew/emergency-console";
import { Findings } from "@/components/crew/findings";
import { HealthRecord } from "@/components/crew/health-record";
import { buildRecord } from "@/components/crew/record-data";
import { PatientMonitor } from "@/components/monitor/patient-monitor";
import { formatDelay } from "@/components/overview/format";
import { StatusBadge } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
import { assessAllCrew, readingsFor } from "@/lib/health/assess";
import { getLiveVitals } from "@/lib/monitor/live";
import { getCrew } from "@/lib/store/readings";
import { listScenarios } from "@/lib/store/scenarios";
import type { LiveVitals } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/crew/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const crew = await getCrew(id);
  return { title: crew ? `${crew.name} · Crew Monitor` : "Crew Monitor" };
}

/** Request time. Server component rendered per request (force-dynamic), so reading the clock is intended. */
function requestTime() {
  return Date.now();
}

const TELEMETRY_CAPTION: Record<LiveVitals["source"], string> = {
  simulated: "Simulated telemetry",
  sensor: "Sensor telemetry",
  mixed: "Sensor + simulated telemetry",
};

function SectionTitle({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">{eyebrow}</p>
        <h2 id={id} className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export default async function CrewMemberPage(props: PageProps<"/crew/[id]">) {
  const { id } = await props.params;
  const now = requestTime();
  const [all, live, scenarios] = await Promise.all([assessAllCrew(), getLiveVitals(id, now), listScenarios(now)]);
  const a = all.find((x) => x.crew.id === id);
  if (!a || !live) notFound();

  const crew = a.crew;
  const mission = currentMission();
  const day = missionDay(now);
  const readings = await readingsFor(crew, 24 * 7);
  const rows = buildRecord(a, readings, now);
  const drill = live.scenario;
  const drillTags = Object.fromEntries(scenarios.map((s) => [s.crewId, "Drill"]));
  const sameRole = crew.role.trim().toLowerCase() === crew.name.trim().toLowerCase();

  return (
    <div className="mx-auto max-w-[1400px] space-y-14 pb-10 md:space-y-20">
      {/* Header */}
      <header className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Crew Monitor · Mission day {day} · {mission.name}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">{crew.name}</h1>
            <p className="mt-2 text-base text-muted md:text-lg">
              {sameRole ? "Crew role: " : ""}
              {crew.role} · signal delay to Earth {formatDelay(mission.commDelaySeconds)} one way
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={a.overall} size="md" flash={a.overall === "critical"} />
              {drill && <StatusBadge status="critical" label="Training scenario · drill" size="md" />}
              <span className="text-xs text-muted">Overall health status</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/body?crew=${encodeURIComponent(crew.id)}`}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <PersonStanding size={16} aria-hidden /> Body map
            </Link>
            <Link
              href={`/check-in?crew=${encodeURIComponent(crew.id)}`}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ClipboardPlus size={16} aria-hidden /> Daily check-in
            </Link>
          </div>
        </div>
        <CrewSwitcher
          crew={all.map((x) => x.crew)}
          active={crew.id}
          statuses={Object.fromEntries(all.map((x) => [x.crew.id, x.overall]))}
          hrefFor={(cid) => `/crew/${encodeURIComponent(cid)}`}
          tags={drillTags}
        />
      </header>

      {/* Keynote-style stage for the live monitor */}
      <section
        aria-labelledby="monitor-heading"
        className="relative -mx-4 overflow-hidden bg-black px-2 py-12 text-white sm:mx-0 sm:rounded-[32px] sm:px-6 md:px-10 md:py-20"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background: `radial-gradient(60% 55% at 50% 85%, ${drill || live.alarms.some((x) => x.priority === "high") ? "rgba(220,38,38,0.22)" : "rgba(92,200,255,0.14)"}, transparent 70%)`,
          }}
        />
        <div className="relative mx-auto max-w-3xl px-2 text-center">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
            <span className="rounded-[3px] bg-white px-1.5 py-0.5 text-[10px] tracking-[0.18em] text-black">Demo</span>
            Demo monitor
          </p>
          <h2 id="monitor-heading" className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
            Vital signs, beat by beat.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60 md:text-base">
            ECG, arterial pressure, pleth and respiration for {crew.name}. {TELEMETRY_CAPTION[live.source]}; waveforms
            synthesised from telemetry.
          </p>
        </div>
        <div className="relative mx-auto mt-10 max-w-[1240px] md:mt-14">
          <PatientMonitor key={crew.id} crewId={crew.id} initial={live} />
        </div>
        <p className="relative mt-8 px-2 text-center text-[11px] text-white/45">
          {drill ? "TRAINING SCENARIO running · not a real emergency · " : ""}Data: NASA OSDR · NOAA SWPC
        </p>
      </section>

      {/* Emergency drill + response checklist */}
      <section aria-labelledby="emergency-heading">
        <SectionTitle id="emergency-heading" eyebrow="Training" title="Emergency drills" />
        <EmergencyConsole
          key={crew.id}
          crewId={crew.id}
          crewName={crew.name}
          initial={live}
          commDelaySeconds={mission.commDelaySeconds}
          missionName={mission.name}
        />
      </section>

      {/* Findings */}
      <section aria-labelledby="findings-heading">
        <SectionTitle id="findings-heading" eyebrow="Assessment" title="Findings & actions" />
        <Findings
          assessments={a.assessments}
          sources={a.sources}
          crewName={crew.name}
          commDelaySeconds={mission.commDelaySeconds}
          drill={drill != null}
        />
      </section>

      {/* Health record */}
      <section aria-labelledby="record-heading">
        <SectionTitle id="record-heading" eyebrow="Health record" title={`Every indicator for ${crew.name}`}>
          <Link href="/guidance" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            How values are judged <ArrowUpRight size={14} aria-hidden />
          </Link>
        </SectionTitle>
        <HealthRecord rows={rows} />
        <p className="mt-3 text-[11px] text-muted">
          Trends: continuous signals over 24 h, daily check-ins over 7 days; shaded strip = normal range. Values marked
          simulated come from the demo telemetry generator until crew entries or sensors replace them. Decision support
          only: flight surgeons remain the medical authority.
        </p>
      </section>

      {/* 24 h charts + 7-day check-ins */}
      <section aria-labelledby="trends-heading">
        <SectionTitle id="trends-heading" eyebrow="Trends" title="Last 24 hours and 7 days" />
        <CrewTrends a={a} readings={readings} now={now} />
      </section>
    </div>
  );
}
