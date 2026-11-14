import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck, Sun, Zap } from "lucide-react";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { Card, PageHeader, Provenance, StatusBadge } from "@/components/ui";
import { currentMission, missionDay } from "@/lib/config";
import { estimateDoseRate, getSpaceWeather } from "@/lib/sources/swpc";
import { listReadings } from "@/lib/store/readings";
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

function sStatus(level: number): Status {
  return level >= 3 ? "critical" : level >= 1 ? "caution" : "nominal";
}

export default async function RadiationPage() {
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
  // Prefer the crew's logged dosimeter reading over the estimate.
  const dosimeter = (await listReadings({ indicator: "radiationCumulative" })).at(-1);
  const estimatedCumulative = day * mission.baselineDoseRate;
  const cumulative = dosimeter?.value ?? estimatedCumulative;
  const pct = Math.min(100, (cumulative / CAREER_LIMIT_MSV) * 100);
  const daysToLimit = Math.max(0, (CAREER_LIMIT_MSV - cumulative) / dose.rate);
  const level = sw?.data.sLevel ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radiation Environment"
        description={`Live solar particle conditions from NOAA's GOES satellites and an estimate of crew exposure for the ${mission.name} profile. Space radiation is the first of NASA's five hazards of human spaceflight: it raises long-term cancer risk and can damage the central nervous system, heart and eyes.`}
      />

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
          <p className="mt-2 text-3xl font-semibold tabular">S{level}</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={sStatus(level)} />
            <span className="text-xs text-muted">{S_LEVEL_TEXT[level].name}</span>
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
            GCR baseline {mission.baselineDoseRate} + solar {dose.sepContribution.toFixed(2)} · indicative estimate
          </p>
        </Card>
      </div>

      <Card className="border-l-4" title="Recommended crew action">
        <p className={`text-sm ${level >= 3 ? "text-critical" : level >= 1 ? "text-caution" : "text-fg"}`}>
          {S_LEVEL_TEXT[level].action}
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
            xFormat="datetime"
            refLines={[
              { y: 10, label: "S1 · 10 pfu", tone: "caution" },
              { y: 1000, label: "S3 · 1000 pfu", tone: "critical" },
            ]}
            height={260}
          />
        </Card>

        <Card title="Mission dose budget" subtitle={`Mission day ${day} · NASA career limit ${CAREER_LIMIT_MSV} mSv`}>
          <p className="text-3xl font-semibold tabular">
            {cumulative.toFixed(0)}
            <span className="ml-1 text-sm font-normal text-muted">/ {CAREER_LIMIT_MSV} mSv</span>
          </p>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Share of career dose limit used"
          >
            <div
              className={`h-full rounded-full ${pct >= 80 ? "bg-critical" : pct >= 50 ? "bg-caution" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Basis</dt>
              <dd className="text-right">
                {dosimeter ? `Dosimeter log (${dosimeter.takenAt.slice(0, 10)})` : "Estimate: days × GCR rate"}
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
            Log your personal dosimeter reading on the Check-in page to replace the estimate.
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
