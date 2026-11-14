import {
  getInspiration4,
  getInspiration4Panel,
  I4_MISSION,
  I4_SUBJECTS,
  PANELS,
  summarizeChanges,
  TIMEPOINTS,
  timepointDay,
  toRows,
  type Panel,
} from "@/lib/sources/osdr";

export const dynamic = "force-dynamic";

/**
 * GET /api/osdr/inspiration4
 *   ?panel=CBC|CMP|CARDIO|CYTOKINE   one panel (default: all panels)
 *   &analyte=glucose                 one analyte (slug id from the panel's analyte list)
 *   &format=rows|compact             flat rows (default) or compact matrices
 * GET /api/osdr/inspiration4?summary=1  % change R+1 vs pre-flight mean for key analytes
 *
 * Real SpaceX Inspiration4 crew blood biomarkers from NASA OSDR (OSD-569, OSD-575).
 * Every response carries provenance (source, freshness, fetchedAt).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const meta = {
    mission: I4_MISSION,
    subjects: I4_SUBJECTS,
    timepoints: TIMEPOINTS.map((t) => ({ timepoint: t, day: timepointDay(t) })),
    dayConvention: "days relative to launch; R+n = splashdown + n days",
  };

  if (sp.get("summary")) {
    const { panels, errors } = await getInspiration4();
    return Response.json({
      ...meta,
      summary: summarizeChanges(panels.map((p) => p.data)),
      provenance: panels.map(({ source, freshness, fetchedAt, error }) => ({ source, freshness, fetchedAt, error })),
      errors,
    });
  }

  const panelParam = sp.get("panel")?.toUpperCase();
  if (panelParam && !PANELS.includes(panelParam as Panel)) {
    return Response.json({ error: `Unknown panel. Use one of ${PANELS.join(", ")}` }, { status: 400 });
  }
  const format = sp.get("format") === "compact" ? "compact" : "rows";
  const analyte = sp.get("analyte")?.toLowerCase() || undefined;

  try {
    const results = panelParam
      ? [await getInspiration4Panel(panelParam as Panel)]
      : (await getInspiration4()).panels;
    const body = results.map((r) => ({
      panel: r.data.panel,
      label: r.data.label,
      kind: r.data.kind,
      study: r.data.study,
      provenance: { source: r.source, freshness: r.freshness, fetchedAt: r.fetchedAt, error: r.error },
      analytes: r.data.analytes.map((a) => ({ id: a.id, name: a.name, unit: a.unit })),
      ...(format === "compact"
        ? { data: analyte ? r.data.analytes.filter((a) => a.id === analyte) : r.data.analytes }
        : { rows: toRows(r.data, analyte) }),
    }));
    if (analyte && body.every((b) => ("rows" in b ? b.rows.length === 0 : b.data.length === 0))) {
      return Response.json({ error: `Unknown analyte "${analyte}"` }, { status: 404 });
    }
    return Response.json({ ...meta, panels: body });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
