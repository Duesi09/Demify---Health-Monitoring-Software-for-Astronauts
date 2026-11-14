import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardPlus,
  Droplet,
  Gauge,
  HeartPulse,
  Orbit,
  RadioTower,
  ShieldCheck,
  Thermometer,
  Wind,
} from "lucide-react";
import type { SeriesDef } from "@/components/charts/time-series";
import { CrewSwitcher } from "@/components/crew-switcher";
import { CrewCard } from "@/components/overview/crew-card";
import { DailyGrid, type DailyRow } from "@/components/overview/daily-grid";
import { EscalationBanner, type EscalationItem } from "@/components/overview/escalation-banner";
import { bySeverity, formatDelay, formatUtc, nominalBand } from "@/components/overview/format";
import { SimulatedTag } from "@/components/overview/status-icon";
import { VitalTile, type VitalTileProps } from "@/components/overview/vital-tile";
import { Card, PageHeader, Provenance, StatusBadge } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
import { assessAllCrew, readingsFor, worst } from "@/lib/health/assess";
import { INDICATORS } from "@/lib/health/knowledge";
import { estimateDoseRate, getSpaceWeather } from "@/lib/sources/swpc";
import type { IndicatorId, Reading } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAILY_IDS: IndicatorId[] = ["sleepHours", "mood", "stress", "hydration", "exerciseMinutes"];
const DAY_MS = 86_400_000;

/** Readings for the 24 h trend: real readings when there are enough to draw, else simulated telemetry. */
function trendReadings(rs: Reading[], id: IndicatorId, since: number) {
  const inWindow = rs.filter((r) => r.indicator === id && Date.parse(r.takenAt) >= since);
  const real = inWindow.filter((r) => r.source !== "simulated");
  const sim = inWindow.filter((r) => r.source === "simulated");
  const useReal = real.length >= 2 || !sim.length;
  return { points: useReal ? real : sim, basis: useReal ? ("measured" as const) : ("simulated" as const) };
}

function relativeAge(iso: string, now: number): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Request time. Server component rendered per request (force-dynamic), so reading the clock is intended. */
function requestTime() {
  return Date.now();
}

export default async function OverviewPage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const crewParam = typeof sp.crew === "string" ? sp.crew : undefined;
  const now = requestTime();
  const mission = currentMission();
  const day = missionDay(now);

  const all = await assessAllCrew();
  const selected = all.find((a) => a.crew.id === crewParam) ?? all[0];

  let sw: Awaited<ReturnType<typeof getSpaceWeather>> | null = null;
  try {
    sw = await getSpaceWeather();
  } catch {
    sw = null;
  }
  const dose = estimateDoseRate(sw?.data.current.p10 ?? null, mission);

  const escalations: EscalationItem[] = all
    .filter((a) => a.escalations.length)
    .map((a) => ({
      crewId: a.crew.id,
      crewName: a.crew.name,
      role: a.crew.role,
      findings: [...a.escalations].sort(bySeverity).map((e) => ({
        indicator: e.indicator,
        status: e.status,
        finding: e.finding,
        source: a.sources[e.indicator],
      })),
    }));

  const longDelay = mission.commDelaySeconds >= 60;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crew Health Overview"
        description={
          longDelay
            ? `At ${formatDelay(mission.commDelaySeconds)} one-way signal delay, ground support cannot respond in real time. The crew assesses itself first: this board shows every crew member's status, what needs attention and what to do.`
            : "Every crew member's status at a glance. Distance from Earth is one of NASA's five hazards of human spaceflight: the further out, the more the crew must assess and treat itself."
        }
      >
        <Link
          href={`/check-in?crew=${selected?.crew.id ?? ""}`}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ClipboardPlus size={16} aria-hidden /> Daily check-in
        </Link>
      </PageHeader>

      <EscalationBanner items={escalations} commDelaySeconds={mission.commDelaySeconds} />

      {/* Mission context */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Mission</span>
            <Orbit size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-xl font-semibold">{mission.name}</p>
          <p className="mt-1 text-xs text-muted">
            Gravity {mission.gravity === 0 ? "≈ 0 g (microgravity)" : `${mission.gravity} g`} · {all.length} crew
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Mission day</span>
            <CalendarDays size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">
            {day}
            <span className="ml-1 text-sm font-normal text-muted">/ {mission.durationDays} planned</span>
          </p>
          <p className="mt-1 text-xs text-muted">{new Date(now).toISOString().slice(0, 10)} UTC</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Signal delay to Earth</span>
            <RadioTower size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">{formatDelay(mission.commDelaySeconds)}</p>
          <p className="mt-1 text-xs text-muted">
            one way · {formatDelay(mission.commDelaySeconds * 2)} round trip
            {longDelay ? " · act first, then report" : ""}
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Radiation environment</span>
            <ShieldCheck size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">
            {sw ? `S${sw.data.sLevel}` : "—"}
            <span className="ml-2 text-sm font-normal text-muted">{dose.rate.toFixed(2)} mSv/day est.</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={sw ? dose.status : "unknown"} />
            <Link href="/radiation" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              Radiation details <ArrowRight size={12} aria-hidden />
            </Link>
          </div>
          <div className="mt-2">
            {sw ? (
              <Provenance result={sw} />
            ) : (
              <p className="text-[11px] text-caution">Space weather feed unavailable; dose is the mission baseline.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Crew grid */}
      <section aria-labelledby="crew-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="crew-heading" className="text-lg font-semibold">
            Crew status
          </h2>
          <p className="text-xs text-muted">Select a crew member for vital signs and the 7-day check-in history.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {all.map((a) => (
            <CrewCard
              key={a.crew.id}
              id={a.crew.id}
              name={a.crew.name}
              role={a.crew.role}
              overall={a.overall}
              regions={a.regions}
              selected={a.crew.id === selected?.crew.id}
              findings={a.assessments
                .filter((x) => x.status === "caution" || x.status === "critical")
                .sort(bySeverity)
                .slice(0, 3)
                .map((x) => ({
                  indicator: x.indicator,
                  status: x.status,
                  finding: x.finding,
                  source: a.sources[x.indicator],
                }))}
            />
          ))}
        </div>
      </section>

      {selected && <CrewDetail selected={selected} all={all} now={now} />}

      <p className="text-xs text-muted">
        Heart rate, blood pressure, SpO₂, temperature and respiration come from a deterministic demo telemetry generator
        (marked <SimulatedTag label="simulated" />) because no public real-time astronaut vitals exist. Daily check-in
        values are simulated until the crew enters real ones; crew entries and devices posting to /api/readings always
        override simulated values. Decision support only: flight surgeons remain the medical authority.
      </p>
    </div>
  );
}

async function CrewDetail({
  selected,
  all,
  now,
}: {
  selected: Awaited<ReturnType<typeof assessAllCrew>>[number];
  all: Awaited<ReturnType<typeof assessAllCrew>>;
  now: number;
}) {
  const crew = selected.crew;
  const readings = await readingsFor(crew, 24 * 7);
  const since24 = now - DAY_MS;
  const byId = new Map(selected.assessments.map((a) => [a.indicator, a]));

  const single = (
    id: IndicatorId,
    title: string,
    icon: VitalTileProps["icon"],
    color = "var(--series-1)",
  ): VitalTileProps => {
    const a = byId.get(id);
    const { points, basis } = trendReadings(readings, id, since24);
    const band = nominalBand(id);
    return {
      title,
      icon,
      parts: [{ id, value: a?.value ?? null, baseline: crew.baseline[id] }],
      status: a?.status ?? "unknown",
      source: selected.sources[id],
      chart: {
        data: points.map((r) => ({ t: r.takenAt, v: r.value })),
        series: [{ key: "v", label: INDICATORS[id].short, color }],
        band: band ? { ...band, label: "Normal" } : undefined,
        basis,
      },
    };
  };

  // Blood pressure: systolic + diastolic on one chart, merged by timestamp.
  const sys = trendReadings(readings, "systolicBP", since24);
  const dia = trendReadings(readings, "diastolicBP", since24);
  const bpRows = new Map<string, { t: string; sys: number | null; dia: number | null }>();
  for (const r of sys.points) bpRows.set(r.takenAt, { t: r.takenAt, sys: r.value, dia: null });
  for (const r of dia.points) {
    const row = bpRows.get(r.takenAt) ?? { t: r.takenAt, sys: null, dia: null };
    row.dia = r.value;
    bpRows.set(r.takenAt, row);
  }
  const bpSeries: SeriesDef[] = [
    { key: "sys", label: "Systolic", color: "var(--series-1)" },
    { key: "dia", label: "Diastolic", color: "var(--series-2)", dashed: true },
  ];
  const bp: VitalTileProps = {
    title: "Blood pressure",
    icon: Droplet,
    parts: [
      {
        id: "systolicBP",
        value: byId.get("systolicBP")?.value ?? null,
        baseline: crew.baseline.systolicBP,
        source: selected.sources.systolicBP,
      },
      {
        id: "diastolicBP",
        value: byId.get("diastolicBP")?.value ?? null,
        baseline: crew.baseline.diastolicBP,
        source: selected.sources.diastolicBP,
      },
    ],
    status: worst([byId.get("systolicBP")?.status ?? "unknown", byId.get("diastolicBP")?.status ?? "unknown"]),
    source: selected.sources.systolicBP,
    chart: {
      data: [...bpRows.values()].sort((a, b) => a.t.localeCompare(b.t)),
      series: bpSeries,
      refLines: [
        { y: 130, label: "sys 130", tone: "caution" },
        { y: 80, label: "dia 80", tone: "caution" },
      ],
      basis: sys.basis === "measured" && dia.basis === "measured" ? "measured" : "simulated",
    },
  };

  const tiles: VitalTileProps[] = [
    single("heartRate", "Heart rate", HeartPulse),
    bp,
    single("spo2", "SpO₂", Gauge),
    single("bodyTemp", "Body temperature", Thermometer),
    single("respRate", "Respiratory rate", Wind),
  ];

  // 7-day daily grid: one value per UTC day, real entries win over simulated.
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => new Date(todayStart - (6 - i) * DAY_MS).toISOString().slice(0, 10));
  const rows: DailyRow[] = DAILY_IDS.map((id) => ({
    id,
    cells: days.map((d) => {
      const rs = readings.filter((r) => r.indicator === id && r.takenAt.startsWith(d));
      const real = rs.filter((r) => r.source !== "simulated");
      const pick = (real.length ? real : rs).at(-1);
      return pick ? { value: pick.value, source: pick.source } : null;
    }),
  }));

  const lastManual = readings.filter((r) => r.source === "manual").at(-1);
  const lastManualCount = lastManual
    ? readings.filter((r) => r.source === "manual" && r.takenAt === lastManual.takenAt).length
    : 0;

  return (
    <section id="detail" aria-labelledby="detail-heading" className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="detail-heading" className="text-lg font-semibold">
            {crew.name} <span className="text-sm font-normal text-muted">· {crew.role}</span>
          </h2>
          <p className="text-xs text-muted">Vital signs over the last 24 hours and daily check-ins over 7 days.</p>
        </div>
        <CrewSwitcher
          crew={all.map((a) => a.crew)}
          active={crew.id}
          basePath="/"
          statuses={Object.fromEntries(all.map((a) => [a.crew.id, a.overall]))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <VitalTile key={t.parts[0].id} {...t} />
        ))}
        <section
          aria-labelledby="checkin-tile"
          className="flex flex-col justify-between rounded-xl border border-dashed border-accent/40 bg-surface p-4"
        >
          <div>
            <h3 id="checkin-tile" className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
              <ClipboardPlus size={15} aria-hidden /> Last self-check-in
            </h3>
            {lastManual ? (
              <>
                <p className="mt-2 text-2xl font-semibold">{relativeAge(lastManual.takenAt, now)}</p>
                <p className="mt-1 text-xs text-muted">
                  {lastManualCount} value{lastManualCount === 1 ? "" : "s"} entered · {formatUtc(lastManual.takenAt)}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold">None in 7 days</p>
                <p className="mt-1 text-xs text-muted">
                  Daily values shown here are simulated until {crew.name} logs a check-in.
                </p>
              </>
            )}
          </div>
          <Link
            href={`/check-in?crew=${crew.id}`}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-accent/50 px-3 py-2 text-sm text-accent hover:bg-accent/10 focus-visible:bg-accent/10"
          >
            Start today&apos;s check-in <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      </div>

      <Card
        title="Daily check-in, last 7 days"
        subtitle="Sleep, mood, stress, hydration and exercise. Bold values with * are crew entries; others are simulated demo data."
      >
        <DailyGrid days={days} rows={rows} />
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Legend">
          {DAILY_IDS.map((id) => (
            <li key={id}>
              <span className="text-fg">{INDICATORS[id].short}</span> normal: {INDICATORS[id].ranges.nominal}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
