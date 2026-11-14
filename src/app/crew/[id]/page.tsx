import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ClipboardPlus, PersonStanding } from "lucide-react";
import { CrewSwitcher } from "@/components/crew-switcher";
import {
  CrewLiveProvider,
  LiveAlarmsNote,
  LiveDrillTag,
  RecordBasisNote,
  StageFootnote,
  StageGlow,
} from "@/components/crew/crew-live";
import { CrewTrends } from "@/components/crew/crew-trends";
import { EmergencyConsole } from "@/components/crew/emergency-console";
import { Findings } from "@/components/crew/findings";
import { HealthRecord } from "@/components/crew/health-record";
import { buildRecord } from "@/components/crew/record-data";
import { LinkSwitch } from "@/components/link-switch";
import { PatientMonitor } from "@/components/monitor/patient-monitor";
import { StatusBadge } from "@/components/ui";
import { currentLink } from "@/lib/config";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { assessAllCrew, readingsFor } from "@/lib/health/assess";
import { linkPolicy, withLink } from "@/lib/link";
import { getLiveVitals } from "@/lib/monitor/live";
import { getCrew } from "@/lib/store/readings";
import { listScenarios } from "@/lib/store/scenarios";
import type { LiveVitals } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/crew/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const crew = await getCrew(id);
  return { title: crew ? `${crew.name} · Crew monitor` : "Crew monitor" };
}

/** Request time. Server component rendered per request (force-dynamic), so reading the clock is intended. */
function requestTime() {
  return Date.now();
}

const TELEMETRY_CAPTION: Record<LiveVitals["source"], string> = {
  simulated: "SIMULATED telemetry",
  sensor: "DEVICE telemetry (posted by a sensor or gateway)",
  mixed: "DEVICE + SIMULATED telemetry",
};

function SectionTitle({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

export default async function CrewMemberPage(props: PageProps<"/crew/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const now = requestTime();
  const [all, live, scenarios] = await Promise.all([assessAllCrew(), getLiveVitals(id, now), listScenarios(now)]);
  const a = all.find((x) => x.crew.id === id);
  if (!a || !live) notFound();

  const crew = a.crew;
  // ?link= swaps the signal delay for every delay string on this page.
  const { profile: link, selected } = currentLink(sp.link);
  const policy = linkPolicy(link.oneWayS);
  const readings = await readingsFor(crew, 24 * 7);
  const rows = buildRecord(a, readings, now);
  // Server view of the drill; the client poll (CrewLiveProvider) refreshes the
  // page when it changes and keeps the header tag and stage glow live.
  const drill = a.scenario ?? live.scenario;
  const drillTags = Object.fromEntries(scenarios.map((s) => [s.crewId, "Drill"]));
  const sameRole = crew.role.trim().toLowerCase() === crew.name.trim().toLowerCase();

  return (
    <CrewLiveProvider key={crew.id} crewId={crew.id} initial={live}>
      <div className="mx-auto max-w-[1400px] space-y-14 pb-10 md:space-y-20">
        {/* Header */}
        <header className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{crew.name}</h1>
              <p className="mt-2 text-base text-muted md:text-lg">
                {sameRole ? "Crew role: " : ""}
                {crew.role} ·{" "}
                {policy.mode === "blackout"
                  ? "no contact with Earth (blackout)"
                  : `signal delay to Earth ${policy.label} one way`}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={a.overall} size="md" flash={a.overall === "critical"} />
                <LiveDrillTag />
                <span className="text-xs text-muted">Overall health status</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={withLink(`/body?crew=${encodeURIComponent(crew.id)}`, selected)}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <PersonStanding size={16} aria-hidden /> Body map
              </Link>
              <Link
                href={withLink(`/check-in?crew=${encodeURIComponent(crew.id)}`, selected)}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ClipboardPlus size={16} aria-hidden /> Daily check-in
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <CrewSwitcher
              crew={all.map((x) => x.crew)}
              active={crew.id}
              statuses={Object.fromEntries(all.map((x) => [x.crew.id, x.overall]))}
              hrefFor={(cid) => withLink(`/crew/${encodeURIComponent(cid)}`, selected)}
              tags={drillTags}
            />
            <LinkSwitch active={link.id} path={`/crew/${encodeURIComponent(crew.id)}`} />
          </div>
        </header>

        {/* Keynote-style stage for the live monitor */}
        <section
          aria-labelledby="monitor-heading"
          className="relative -mx-4 overflow-hidden bg-black px-2 py-12 text-white sm:mx-0 sm:rounded-[32px] sm:px-6 md:px-10 md:py-20"
        >
          <StageGlow />
          <div className="relative mx-auto max-w-3xl px-2 text-center">
            <h2 id="monitor-heading" className="text-3xl font-semibold tracking-tight md:text-5xl">
              Vital signs, beat by beat.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-white/60 md:text-base">
              Simulated training monitor for {crew.name}: ECG, arterial pressure, pleth and respiration.{" "}
              {TELEMETRY_CAPTION[live.source]}; waveforms synthesised from telemetry.
            </p>
          </div>
          <div className="relative mx-auto mt-10 max-w-[1240px] md:mt-14">
            <PatientMonitor key={crew.id} crewId={crew.id} initial={live} />
          </div>
          <StageFootnote />
        </section>

        {/* Emergency drill + response checklist */}
        <section aria-labelledby="emergency-heading">
          <SectionTitle id="emergency-heading" title="Emergency drills" />
          <EmergencyConsole
            crewId={crew.id}
            crewName={crew.name}
            commDelaySeconds={link.oneWayS}
            missionName={link.name}
          />
        </section>

        {/* Findings */}
        <section aria-labelledby="findings-heading">
          <SectionTitle id="findings-heading" title="Findings & actions" />
          <div className="mb-4">
            <LiveAlarmsNote />
          </div>
          <Findings
            assessments={a.assessments}
            sources={a.sources}
            crewName={crew.name}
            commDelaySeconds={link.oneWayS}
            drill={drill != null}
            link={selected}
          />
        </section>

        {/* Health record */}
        <section aria-labelledby="record-heading">
          <SectionTitle id="record-heading" title={`Every indicator for ${crew.name}`}>
            <Link href={withLink("/guidance", selected)} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              How values are judged <ArrowUpRight size={14} aria-hidden />
            </Link>
          </SectionTitle>
          <RecordBasisNote crewName={crew.name} />
          <HealthRecord rows={rows} />
          <p className="mt-3 text-[11px] text-muted">
            Trends: continuous signals over 24 h, daily check-ins over 7 days; shaded strip = normal range. Values marked
            SIMULATED come from the demo telemetry generator until crew entries or DEVICE readings replace them.{" "}
            {DISCLAIMER_SHORT}
          </p>
        </section>

        {/* 24 h charts + 7-day check-ins */}
        <section aria-labelledby="trends-heading">
          <SectionTitle id="trends-heading" title="Last 24 hours and 7 days" />
          <CrewTrends a={a} readings={readings} now={now} />
        </section>
      </div>
    </CrewLiveProvider>
  );
}
