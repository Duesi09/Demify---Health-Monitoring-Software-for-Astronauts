import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, ClipboardPlus, Orbit, RadioTower, ShieldCheck } from "lucide-react";
import { CrewGrid, type CrewGridItem } from "@/components/overview/crew-grid";
import { CrewTrends } from "@/components/overview/crew-trends";
import { EscalationBanner, escalationItems } from "@/components/overview/escalation-banner";
import { LinkSwitch } from "@/components/link-switch";
import { bySeverity } from "@/components/overview/format";
import { SimulatedTag } from "@/components/overview/status-icon";
import { buildCrewTrends } from "@/components/overview/trends-data";
import { Provenance, StatusBadge } from "@/components/ui";
import { currentLink, currentMission, missionDay } from "@/lib/config";
import { assessAllCrew, readingsFor } from "@/lib/health/assess";
import { MARS_DELAY_RANGE, linkPolicy, withLink } from "@/lib/link";
import { getAllLiveVitals } from "@/lib/monitor/live";
import { estimateDoseRate, getSpaceWeather } from "@/lib/sources/swpc";

export const dynamic = "force-dynamic";

/** Request time. Server component rendered per request (force-dynamic), so reading the clock is intended. */
function requestTime() {
  return Date.now();
}

/** Mission stat card: a plain sentence-case title, one large light numeral, a quiet caption. */
function Stat({
  label,
  icon,
  value,
  unit,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-[24px] border border-border/70 bg-surface p-5 md:p-6">
      <div className="flex items-center justify-between gap-2 text-muted">
        <h2 className="text-sm font-medium">{label}</h2>
        {icon}
      </div>
      <p className="mt-4 text-4xl font-light leading-none tracking-[-0.03em] tabular md:text-5xl">
        {value}
        {unit && <span className="ml-2 text-sm font-normal tracking-normal text-muted">{unit}</span>}
      </p>
      <div className="mt-3 text-xs text-muted">{children}</div>
    </section>
  );
}

export default async function OverviewPage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const now = requestTime();
  const mission = currentMission();
  const day = missionDay(now);
  // ?link= swaps the signal delay only (gravity, duration and dose stay with
  // the mission); every delay string on this page follows `link`.
  const { profile: link, selected } = currentLink(sp.link);
  const policy = linkPolicy(link.oneWayS);
  const crewParam = typeof sp.crew === "string" ? sp.crew : undefined;

  const [all, initialVitals] = await Promise.all([assessAllCrew(), getAllLiveVitals(now)]);

  // Crew trends: 7 days of readings per crew member, downsampled server-side
  // (hourly medians / one value per day) so the client gets a few rows only.
  const trendReadings = await Promise.all(all.map((a) => readingsFor(a.crew, 24 * 7)));
  const trends = buildCrewTrends(
    all.map((a) => ({ id: a.crew.id, name: a.crew.name })),
    Object.fromEntries(all.map((a, i) => [a.crew.id, trendReadings[i]])),
    now,
  );

  let sw: Awaited<ReturnType<typeof getSpaceWeather>> | null = null;
  try {
    sw = await getSpaceWeather();
  } catch {
    sw = null;
  }
  const sLevel = sw && sw.data.current.p10 != null ? sw.data.sLevel : null;
  const dose = estimateDoseRate(sw?.data.current.p10 ?? null, mission);

  const escalations = escalationItems(all);

  // Plain, serialisable data for the live (client) crew grid.
  const crew: CrewGridItem[] = all.map((a) => ({
    id: a.crew.id,
    link: selected,
    name: a.crew.name,
    role: a.crew.role,
    overall: a.overall,
    regions: a.regions,
    findings: a.assessments
      .filter((x) => x.status === "caution" || x.status === "critical")
      .sort(bySeverity)
      .slice(0, 3)
      .map((x) => ({
        indicator: x.indicator,
        status: x.status,
        finding: x.finding,
        source: a.sources[x.indicator],
        ...(x.drill ? { drill: true } : {}),
      })),
  }));

  return (
    <div className="mx-auto max-w-[1400px] space-y-12 pb-10 md:space-y-16">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">Crew health.</h1>
          <p className="mt-3 text-base leading-relaxed text-muted md:text-lg">
            {policy.mode === "blackout"
              ? "No contact with the ground (blackout): act on the onboard procedures; transmit when contact returns. The crew assesses itself: every crew member's status, what needs attention and what to do."
              : policy.mode === "delayed"
                ? `At ${policy.label} one-way signal delay, ground support cannot respond in real time. The crew assesses itself first: every crew member's status, what needs attention and what to do.`
                : "Every crew member's status at a glance. Distance from Earth is one of NASA's five hazards of human spaceflight: the further out, the more the crew must assess and treat itself."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={selected && all.length ? withLink(`/crew/${encodeURIComponent(all[0].crew.id)}`, selected) : "/crew"}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
          >
            Crew monitor <ArrowUpRight size={15} aria-hidden />
          </Link>
          <Link
            href={withLink("/check-in", selected)}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-accent/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ClipboardPlus size={15} aria-hidden /> Daily check-in
          </Link>
        </div>
        <LinkSwitch active={link.id} path="/" query={{ crew: crewParam }} className="basis-full" />
      </header>

      {/* Crew grid */}
      <section aria-labelledby="crew-heading">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="crew-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
              Heart and blood pressure monitors
            </h2>
            <p className="mt-1 text-sm text-muted">
              Simulated training monitors: SIMULATED telemetry unless a sensor or gateway posts DEVICE readings.
            </p>
          </div>
        </div>
        <CrewGrid crew={crew} initialVitals={initialVitals} />
      </section>

      <EscalationBanner items={escalations} commDelaySeconds={link.oneWayS} link={selected} />

      {/* Mission context */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Mission" icon={<Orbit size={16} aria-hidden />} value={<span className="text-3xl md:text-[34px]">{mission.name}</span>}>
          Gravity {mission.gravity === 0 ? "≈ 0 g (microgravity)" : `${mission.gravity} g`} · {all.length} crew
        </Stat>
        <Stat
          label="Mission day"
          icon={<CalendarDays size={16} aria-hidden />}
          value={day}
          unit={`/ ${mission.durationDays} planned`}
        >
          {new Date(now).toISOString().slice(0, 10)} UTC
        </Stat>
        <Stat
          label="Signal delay to Earth"
          icon={<RadioTower size={16} aria-hidden />}
          value={policy.mode === "blackout" ? <span className="text-3xl md:text-[34px]">No contact</span> : policy.label}
          unit={policy.mode === "blackout" ? "(blackout)" : "one way"}
        >
          <p>
            {policy.mode === "blackout"
              ? "Act on the onboard procedures; transmit when contact returns."
              : `${policy.roundTripLabel} round trip${policy.mode === "delayed" ? " · act first, then report" : ""}`}
          </p>
          <p className="mt-1">
            {link.label}: {link.basis}.
            {link.id.startsWith("mars") || link.id === "conjunction" ? ` Mars in general: ${MARS_DELAY_RANGE}.` : ""}
          </p>
        </Stat>
        <Stat
          label="Radiation"
          icon={<ShieldCheck size={16} aria-hidden />}
          value={sLevel != null ? `S${sLevel}` : "—"}
          unit={`${dose.rate.toFixed(2)} mSv/day, illustrative`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sLevel != null ? dose.status : "unknown"} />
            <Link href="/radiation" className="inline-flex items-center gap-1 text-accent hover:underline">
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
        </Stat>
      </div>

      {/* Crew trends: small multiples, one chart per indicator, one line per crew member */}
      <section aria-labelledby="trends-heading">
        <div className="mb-6">
          <h2 id="trends-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
            Crew trends.
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {!trends.hasData ? (
              "No readings in the last 7 days yet. Charts fill in as the crew and devices report."
            ) : trends.allSimulated ? (
              <>
                <SimulatedTag />
                All values are demo data from the simulator. Shading marks the nominal range; training scenarios are not
                plotted.
              </>
            ) : (
              <>
                <SimulatedTag />
                Demo data from the simulator, except crew entries and DEVICE readings (marked * and † in tables).
                Shading marks the nominal range; training scenarios are not plotted.
              </>
            )}
          </p>
        </div>
        <CrewTrends data={trends} />
      </section>

      <section aria-label="About the data" className="border-t border-border/60 pt-6 text-xs leading-relaxed text-muted">
        <p>
          Heart rate, blood pressure, SpO₂, temperature and respiration come from a deterministic demo telemetry
          generator (marked <SimulatedTag />) because no public real-time astronaut vitals exist. Monitor waveforms are
          synthesised from those numbers. Training scenarios (drills) only change simulated telemetry and are always
          labelled. Daily check-in values are simulated until the crew enters real ones; crew entries and DEVICE
          readings posted to /api/readings always override simulated values.
        </p>
      </section>
    </div>
  );
}
