// TEMPORARY preview for the monitor agent. MUST be deleted before finishing.
import { PatientMonitor } from "@/components/monitor/patient-monitor";
import { MiniMonitor } from "@/components/monitor/mini-monitor";
import { getLiveVitals } from "@/lib/monitor/live";

export const dynamic = "force-dynamic";

export default async function Page(props: PageProps<"/monitor-preview">) {
  const sp = await props.searchParams;
  const id = typeof sp.crew === "string" ? sp.crew : "ms1";
  const v = await getLiveVitals(id);
  const ids = ["cdr", "plt", "ms1", "ms2"];
  const all = await Promise.all(ids.map((x) => getLiveVitals(x)));
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <PatientMonitor crewId={id} initial={v!} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {all.map((x) => x && (
          <div key={x.crewId} className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 text-sm">{x.crewName} <span className="text-xs text-muted">Demo monitor</span></div>
            <MiniMonitor vitals={x} />
          </div>
        ))}
      </div>
    </div>
  );
}
