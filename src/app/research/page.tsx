import type { Metadata } from "next";
import { Database, Droplets, ExternalLink, Info, Orbit, Rocket, Users } from "lucide-react";
import { BiomarkerExplorer } from "@/components/research/biomarker-explorer";
import { ChangeSummary } from "@/components/research/change-summary";
import { IssDoseChart } from "@/components/research/iss-dose-chart";
import { StudySearch } from "@/components/research/study-search";
import { Card, PageHeader, Provenance } from "@/components/ui";
import { getIssDoseReference } from "@/lib/sources/eda";
import {
  DEFAULT_SEARCH,
  I4_MISSION,
  I4_SUBJECTS,
  TIMEPOINTS,
  getInspiration4,
  getMissionStudies,
  searchStudies,
  studyUrl,
  summarizeChanges,
  timepointDay,
} from "@/lib/sources/osdr";
import type { SourceResult } from "@/lib/types";

export const metadata: Metadata = { title: "NASA Data" };
export const dynamic = "force-dynamic";

function meta<T>(r: SourceResult<T>) {
  return { source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, ...(r.error ? { error: r.error } : {}) };
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default async function ResearchPage() {
  const [i4, mission, search, dose] = await Promise.all([
    getInspiration4(),
    getMissionStudies().catch((e) => ({ error: errMsg(e) })),
    searchStudies(DEFAULT_SEARCH).catch(() => null),
    getIssDoseReference().catch((e) => ({ error: errMsg(e) })),
  ]);

  const timepoints = TIMEPOINTS.map((t) => ({ timepoint: t, day: timepointDay(t)! }));
  const subjects = I4_SUBJECTS.map((s) => ({ id: s.id, sex: s.sex }));
  const panels = i4.panels.map((p) => ({ data: p.data, meta: meta(p) }));
  const summary = summarizeChanges(i4.panels.map((p) => p.data));
  const studyAccessions = [...new Set(i4.panels.map((p) => p.data.study.accession))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="NASA Data"
        description="Real, public astronaut and spaceflight data from NASA's Open Science Data Repository (OSDR), downloaded server-side, cached and bundled for offline use on board."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="What this page shows">
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              <a href="https://osdr.nasa.gov/bio/" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                NASA OSDR
              </a>{" "}
              is NASA&apos;s open archive of space-biology and human-research data: omics, physiology, imaging and environment
              measurements from spaceflight and ground studies, free to reuse.
            </p>
            <div className="flex gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <p>
                <span className="font-medium">Honest scope:</span> public OSDR contains no real-time astronaut vital signs (heart rate,
                blood pressure, SpO₂). Those stay private medical data. What it does publish are real crew blood tests. Below are the
                blood biomarkers of the four SpaceX Inspiration4 crew, measured before and after flight. They show the kind of
                changes Demify&apos;s in-flight self-checks are designed to catch early.
              </p>
            </div>
          </div>
        </Card>
        <Card title="SpaceX Inspiration4" subtitle="First all-civilian orbital mission">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact icon={<Rocket size={14} aria-hidden />} label="Flight" value={`${I4_MISSION.launch.slice(5)} → ${I4_MISSION.splashdown.slice(5)}.2021`} />
            <Fact icon={<Orbit size={14} aria-hidden />} label="Orbit" value={`${I4_MISSION.orbitKm} km · ${I4_MISSION.durationDays} days`} />
            <Fact icon={<Users size={14} aria-hidden />} label="Crew" value="4 (2 F, 2 M)" />
            <Fact icon={<Droplets size={14} aria-hidden />} label="Blood draws" value={`${TIMEPOINTS.length} per person`} />
          </dl>
          <p className="mt-3 text-xs text-muted">
            Draws at L-92, L-44, L-3 (days before launch) and R+1, R+45, R+82, R+194 (days after return). Crew are identified only by
            study codes C001–C004.
          </p>
        </Card>
      </div>

      <Card
        title="Inspiration4 crew biomarker explorer"
        subtitle="Choose a blood panel and marker. One line per crew member; rings mark values outside the lab reference range."
      >
        {panels.length ? (
          <BiomarkerExplorer
            panels={panels}
            timepoints={timepoints}
            subjects={subjects}
            flight={{ launch: I4_MISSION.launch, splashdown: I4_MISSION.splashdown, durationDays: I4_MISSION.durationDays }}
          />
        ) : (
          <p className="text-sm text-critical">Inspiration4 data unavailable: {i4.errors.map((e) => `${e.panel}: ${e.error}`).join("; ")}</p>
        )}
        {panels.length > 0 && i4.errors.length > 0 && (
          <p className="mt-3 text-xs text-caution">Some panels unavailable: {i4.errors.map((e) => e.panel).join(", ")}</p>
        )}
      </Card>

      <Card
        title="What changed after flight"
        subtitle="Change one day after splashdown (R+1) versus each person's pre-flight average"
        action={
          <span className="flex flex-wrap justify-end gap-x-2 text-[11px] text-muted">
            {studyAccessions.map((a) => (
              <a key={a} href={studyUrl(a)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                {a} <ExternalLink size={10} aria-hidden />
              </a>
            ))}
          </span>
        }
      >
        <ChangeSummary rows={summary} subjects={subjects} />
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <Takeaway title="Immune">
            Absolute lymphocytes fell in three of four crew right after landing, the typical post-flight stress pattern, and
            rebounded by R+45.
          </Takeaway>
          <Takeaway title="Inflammation">
            IL-6 rose in all four crew at R+1 and CRP rose in all four: a short systemic inflammatory response to the flight and
            re-entry.
          </Takeaway>
          <Takeaway title="Metabolism">
            Glucose was higher at R+1 than before flight in every crew member, consistent with landing stress hormones.
          </Takeaway>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Measured ISS radiation dose"
          subtitle="Daily absorbed dose inside the ISS during rodent-research missions (area dosimetry, not personal crew badges)"
        >
          {"error" in dose ? (
            <p className="text-sm text-critical">Dosimetry unavailable: {dose.error}</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <Stat label="Mean dose rate" value={dose.data.meanTotal.toFixed(2)} unit="mGy/day" />
                <Stat label="From cosmic rays" value={`${Math.round((dose.data.meanGcr / dose.data.meanTotal) * 100)}`} unit="%" />
                <Stat label="Mission range" value={`${dose.data.min.toFixed(2)}–${dose.data.max.toFixed(2)}`} unit="mGy/day" />
              </div>
              <IssDoseChart
                mean={dose.data.meanTotal}
                bars={dose.data.missions.map((m) => ({
                  name: m.name,
                  title: m.title,
                  start: m.start,
                  days: m.days,
                  gcr: m.meanGcr,
                  saa: m.meanSaa,
                  total: m.meanTotal,
                }))}
              />
              <p className="mt-3 text-xs text-muted">
                Absorbed dose (mGy) from {dose.data.missions.length} missions, {dose.data.missions[0].start.slice(0, 4)}–
                {dose.data.missions.at(-1)!.start.slice(0, 4)}. The cosmic-ray share is higher near solar minimum (2019–2020), when
                the weaker solar wind lets more galactic cosmic rays in. Multiply by a quality factor of roughly 2 for an
                approximate dose equivalent in mSv.
              </p>
              <div className="mt-2">
                <Provenance result={dose} />
              </div>
            </>
          )}
        </Card>

        <Card
          className="xl:col-span-2"
          title="All Inspiration4 datasets"
          subtitle="Studies linked to the mission in the OSDR registry"
        >
          {"error" in mission ? (
            <p className="text-sm text-critical">Mission registry unavailable: {mission.error}</p>
          ) : (
            <>
              <ul className="divide-y divide-border text-sm">
                {mission.data.studies.map((s) => (
                  <li key={s.accession} className="py-2">
                    <a href={s.url} target="_blank" rel="noreferrer" className="group flex gap-2 hover:text-accent">
                      <span className="mt-0.5 shrink-0 self-start whitespace-nowrap rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] text-accent">{s.accession}</span>
                      <span className="min-w-0">
                        {s.title ?? "Untitled study"}
                        <ExternalLink size={11} className="ml-1 inline text-muted group-hover:text-accent" aria-hidden />
                        {s.measurement.length > 0 && (
                          <span className="block text-xs text-muted">{s.measurement.slice(0, 3).join(" · ")}</span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <Provenance result={mission} />
              </div>
            </>
          )}
        </Card>
      </div>

      <Card
        title="Search NASA OSDR"
        subtitle="Find spaceflight studies by topic, organism, tissue or mission. Results open on osdr.nasa.gov."
        action={<Database size={16} className="text-muted" aria-hidden />}
      >
        <StudySearch initial={search ? { data: search.data, meta: meta(search) } : null} />
      </Card>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular">{value}</dd>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular">
        {value}
        <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
      </p>
    </div>
  );
}

function Takeaway({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted">{title}</p>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
