import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck, Sun, Zap } from "lucide-react";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { CrewSwitcher } from "@/components/crew-switcher";
import { Card, PageHeader, Provenance, StatusBadge } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
import { getIssDoseReference } from "@/lib/sources/eda";
import { estimateDoseRate, getSpaceWeather } from "@/lib/sources/swpc";
import { listCrew, listReadings } from "@/lib/store/readings";
import type { Status } from "@/lib/types";

export const metadata: Metadata = { title: "Radiation" };
export const dynamic = "force-dynamic";

/** NASA-STD-3001 Vol. 1 Rev. B: career effective dose limit. */
const CAREER_LIMIT_MSV = 600;

const S_LEVEL_TEXT: Record<number, { name: string; action: string }> = {
  0: { name: "None", action: "Normal operations. Keep personal dosimeter worn." },
  1: { name: "Minor (S1)", action: "Heightened awareness. Review shelter plan; plan EVAs with caution." },
  2: { name: "Moderate (S2)", action: "Defer EVAs. Prepare storm shelter; crew in deep-space vehicles should be ready to shelter." },
  3: { name: "Strong (S3)", action: "Shelter in the most shielded area (water/stowage wall). Ground flight surgeons notified." },
  4: { name: "Severe (S4)", action: "Shelter immediately and remain until all-clear. Track dosimeters every hour." },
  5: { name: "Extreme (S5)", action: "Shelter immediately. Unshielded exposure may cause acute radiation effects. Emergency protocol." },
};

/** Shown instead of an S-level action when current conditions are unknown. Never fall back to "Normal operations". */
const UNKNOWN_ACTION =
  "Space weather unknown: follow onboard dosimeter alarms and the last NOAA bulletin. Treat conditions as unconfirmed until live data returns.";

function sStatus(level: number | null): Status {
  if (level == null) return "unknown";
  return level >= 3 ? "critical" : level >= 1 ? "caution" : "nominal";
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RadiationPage(props: PageProps<"/radiation">) {
  const sp = await props.searchParams;
  const crew = await listCrew();
  const crewParam = first(sp.crew);
  const activeCrew = crew.find((c) => c.id === crewParam) ?? crew[0];
  const mission = currentMission();
  const day = missionDay();
  let sw: Awaited<ReturnType<typeof getSpaceWeather>> | null = null;
  let error: string | null = null;
  try {
    sw = await getSpaceWeather();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const dose = estimateDoseRate(sw?.data.current.p10 ?? null, mission);
  // Real ISS area dosimetry from NASA OSDR, used to sanity-check the estimate.
  const issRef = await getIssDoseReference().catch(() => null);
  // Prefer this crew member's own logged dosimeter reading over the estimate.
  // Dosimeter totals are personal, so never mix readings across crew members.
  const dosimeter = activeCrew
    ? (await listReadings({ crewId: activeCrew.id, indicator: "radiationCumulative" })).at(-1)
    : undefined;
  const estimatedCumulative = day * mission.baselineDoseRate;
  const cumulative = dosimeter?.value ?? estimatedCumulative;
  const pct = Math.min(100, (cumulative / CAREER_LIMIT_MSV) * 100);
  const daysToLimit = Math.max(0, (CAREER_LIMIT_MSV - cumulative) / dose.rate);
  // Without a live/cached proton flux the storm level is unknown, not S0.
  const level = sw && sw.data.current.p10 != null ? sw.data.sLevel : null;
  const levelText = level != null ? S_LEVEL_TEXT[level] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radiation Environment"
        description={`Live solar particle conditions from NOAA's GOES satellites and an estimate of crew exposure for the ${mission.name} profile. Space radiation is the first of NASA's five hazards of human spaceflight: it raises long-term cancer risk and can damage the central nervous system, heart and eyes.`}
      >
        {crew.length > 0 && activeCrew && <CrewSwitcher crew={crew} active={activeCrew.id} basePath="/radiation" />}
      </PageHeader>

      {error && (
        <Card className="border-critical/50">
          <p className="text-sm text-critical">Space weather data unavailable: {error}</p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Solar radiation storm</span>
            <AlertTriangle size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">{level != null ? `S${level}` : "—"}</p>
          <div className="mt-1 flex items-center gap-2">
            {/* Status shape + NOAA scale name (None, Minor … Extreme); the S-level itself is the numeral above. */}
            <StatusBadge status={sStatus(level)} label={level === 0 ? "No storm" : levelText ? levelText.name : "Unknown"} />
            <span className="text-xs text-muted">{levelText ? "NOAA S-scale" : "No proton flux data"}</span>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Proton flux ≥10 MeV</span>
            <Zap size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">
            {sw?.data.current.p10 != null ? sw.data.current.p10.toFixed(2) : "—"}
            <span className="ml-1 text-sm font-normal text-muted">pfu</span>
          </p>
          <p className="mt-1 text-xs text-muted">S1 storm threshold: 10 pfu</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Solar X-ray flare class</span>
            <Sun size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">{sw?.data.flareClass ?? "—"}</p>
          <p className="mt-1 text-xs text-muted">M/X-class flares can precede particle events</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted">Est. crew dose rate</span>
            <ShieldCheck size={16} className="text-muted" aria-hidden />
          </div>
          <p className="mt-2 text-3xl font-semibold tabular">
            {dose.rate.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-muted">mSv/day</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            GCR baseline {mission.baselineDoseRate} +{" "}
            {level != null ? `solar ${dose.sepContribution.toFixed(2)}` : "solar unknown (not included)"} · indicative estimate
          </p>
        </Card>
      </div>

      <Card
        title="Recommended crew action"
        action={<StatusBadge status={sStatus(level)} size="md" label={level != null ? `S${level}` : "S –"} />}
      >
        <p className={`text-[15px] leading-relaxed ${level != null && level >= 1 ? "font-medium" : ""}`}>
          {levelText ? levelText.action : UNKNOWN_ACTION}
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="GOES proton flux, last 3 days"
          subtitle="Integral flux, log scale. Rising ≥100 MeV flux means penetrating particles that shielding stops poorly."
          action={sw && <Provenance result={sw} />}
        >
          <TimeSeriesChart
            ariaLabel="Proton flux for the last three days"
            data={(sw?.data.protons ?? []).map((p) => ({ t: p.t, p10: p.p10, p100: p.p100 }))}
            series={[
              { key: "p10", label: "≥10 MeV", color: "var(--series-1)" },
              { key: "p100", label: "≥100 MeV", color: "var(--series-2)", dashed: true },
            ]}
            unit="pfu"
            log
            yDomain={[0.05, "auto"]}
            // Keep the S1 threshold in view so crews see their margin to a storm.
            includeY={[10]}
            xFormat="datetime"
            refLines={[
              { y: 10, label: "S1 · 10 pfu", tone: "caution" },
              { y: 1000, label: "S3 · 1000 pfu", tone: "critical" },
            ]}
            height={260}
          />
        </Card>

        <Card
          title={activeCrew ? `Mission dose budget · ${activeCrew.name}` : "Mission dose budget"}
          subtitle={`Mission day ${day} · NASA career limit ${CAREER_LIMIT_MSV} mSv`}
        >
          <p className="text-3xl font-semibold tabular">
            {cumulative.toFixed(0)}
            <span className="ml-1 text-sm font-normal text-muted">/ {CAREER_LIMIT_MSV} mSv</span>
          </p>
          {/* Squared gauge with fixed 50 % / 80 % marks (monitor style, not a rounded pill bar). */}
          <div
            className="relative mt-3 h-3 w-full overflow-hidden rounded-[2px] border border-border bg-surface-2"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${Math.round(pct)} % of the career limit`}
            aria-label={`Share of career dose limit used${activeCrew ? ` by ${activeCrew.name}` : ""}`}
          >
            <div
              className={`h-full ${pct > 80 ? "bg-critical-fill" : pct >= 50 ? "bg-caution-fill" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
            <span className="absolute inset-y-0 left-1/2 w-px bg-fg/35" aria-hidden />
            <span className="absolute inset-y-0 left-[80%] w-px bg-fg/35" aria-hidden />
          </div>
          <div className="relative mt-1 h-3 text-[10px] tabular text-muted" aria-hidden>
            <span className="absolute left-0">0</span>
            <span className="absolute left-1/2 -translate-x-1/2">50 %</span>
            <span className="absolute left-[80%] -translate-x-1/2">80 %</span>
            <span className="absolute right-0">{CAREER_LIMIT_MSV}</span>
          </div>
          {pct >= 50 && (
            <StatusBadge
              status={pct > 80 ? "critical" : "caution"}
              size="xs"
              label={`${Math.round(pct)} % of career limit`}
              className="mt-2"
            />
          )}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Basis</dt>
              <dd className="text-right">
                {dosimeter
                  ? `${activeCrew?.name ?? "Crew"} dosimeter log (${dosimeter.takenAt.slice(0, 10)})`
                  : "Estimate: days × GCR rate"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Budget left at current rate</dt>
              <dd className="tabular">{daysToLimit > 9999 ? "> 9999" : daysToLimit.toFixed(0)} days</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Planned mission length</dt>
              <dd className="tabular">{mission.durationDays} days</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            {dosimeter
              ? "Each crew member's budget uses their own dosimeter log. Switch crew above to check the others."
              : `Log ${activeCrew ? `${activeCrew.name}'s` : "your"} personal dosimeter reading on the Check-in page to replace the estimate.`}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Measured ISS dose (NASA OSDR)"
          subtitle="Daily absorbed dose inside the ISS from area dosimeters, Rodent Research missions. Cross-check for the estimate above."
          action={issRef && <Provenance result={issRef} />}
        >
          {issRef ? (
            <>
              <dl className="mb-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Mean, {issRef.data.missions.length} missions</dt>
                  <dd className="text-xl font-semibold tabular">
                    {issRef.data.meanTotal.toFixed(2)} <span className="text-xs font-normal text-muted">mGy/day</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">≈ dose equivalent (Q ≈ 2)</dt>
                  <dd className="text-xl font-semibold tabular">
                    {(issRef.data.meanTotal * 2).toFixed(2)} <span className="text-xs font-normal text-muted">mSv/day</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Range across missions</dt>
                  <dd className="text-xl font-semibold tabular">
                    {issRef.data.min.toFixed(2)}–{issRef.data.max.toFixed(2)}
                  </dd>
                </div>
              </dl>
              <TimeSeriesChart
                ariaLabel={`Daily ISS absorbed dose during ${issRef.data.latest.name}`}
                data={issRef.data.latest.points.map((p) => ({ t: p.t, total: p.total, gcr: p.gcr }))}
                series={[
                  { key: "total", label: "Total (GCR + SAA)", color: "var(--series-1)" },
                  { key: "gcr", label: "Galactic cosmic rays", color: "var(--series-3)", dashed: true },
                ]}
                unit="mGy/day"
                xFormat="date"
                decimals={2}
                height={200}
              />
              <p className="mt-2 text-xs text-muted">
                Series: {issRef.data.latest.title || issRef.data.latest.name} ({issRef.data.latest.start} to {issRef.data.latest.end}).
                The South Atlantic Anomaly (SAA), where Earth&apos;s radiation belt dips lowest, contributes about half of the ISS dose.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">ISS dosimetry reference unavailable.</p>
          )}
        </Card>

        <Card title="NASA exposure limits" subtitle="NASA-STD-3001 Vol. 1 Rev C">
          <table className="w-full text-left text-sm">
            <tbody className="[&_td]:py-1.5 [&_tr]:border-t [&_tr]:border-border [&_tr:first-child]:border-0">
              <tr><td className="pr-3 text-muted">Career effective dose</td><td className="tabular">&lt; 600 mSv</td></tr>
              <tr><td className="pr-3 text-muted">Per solar particle event (design)</td><td className="tabular">&lt; 250 mSv</td></tr>
              <tr><td className="pr-3 text-muted">Blood-forming organs</td><td className="tabular">250 mGy-Eq / 30 d</td></tr>
              <tr><td className="pr-3 text-muted">Lens of the eye</td><td className="tabular">1,000 mGy-Eq / 30 d</td></tr>
              <tr><td className="pr-3 text-muted">Habitat GCR rate, free space</td><td className="tabular">&lt; 1.3 mSv/day</td></tr>
              <tr><td className="pr-3 text-muted">Habitat GCR rate, surface</td><td className="tabular">&lt; 0.9 mSv/day</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Storm shelter: ~10 cm water-equivalent shielding halves solar-particle dose but cuts cosmic-ray dose by only ~7 %. Always ALARA.
          </p>
        </Card>
      </div>

      {sw && sw.data.forecast.length > 0 && (
        <Card title="NOAA 3-day outlook" subtitle="Probability of a solar radiation storm (S1+) and radio blackouts">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 pr-4 font-normal">Date (UTC)</th>
                  <th className="py-1 pr-4 font-normal">S1+ radiation storm</th>
                  <th className="py-1 pr-4 font-normal">R1–R2 blackout</th>
                  <th className="py-1 font-normal">R3+ blackout</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {sw.data.forecast.map((f) => (
                  <tr key={f.date} className="border-t border-border">
                    <td className="py-1.5 pr-4">{f.date}</td>
                    <td className="py-1.5 pr-4">{f.sProb ?? "—"} %</td>
                    <td className="py-1.5 pr-4">{f.rMinorProb ?? "—"} %</td>
                    <td className="py-1.5">{f.rMajorProb ?? "—"} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
