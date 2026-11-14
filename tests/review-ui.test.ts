import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyGrid, type DailyRow } from "@/components/overview/daily-grid";
import { CrewSwitcher } from "@/components/crew-switcher";
import type { CrewMember } from "@/lib/types";

const days = ["2026-11-12", "2026-11-13", "2026-11-14"];

function grid(rows: DailyRow[]) {
  return renderToStaticMarkup(createElement(DailyGrid, { days, rows }));
}

describe("DailyGrid provenance (#25)", () => {
  const rows: DailyRow[] = [
    {
      id: "sleepHours",
      cells: [
        { value: 7.5, source: "simulated" },
        { value: 7.1, source: "manual" },
        { value: 6.9, source: "sensor" },
      ],
    },
  ];
  const html = grid(rows);

  it("labels a sensor reading as a DEVICE reading, not a crew entry", () => {
    expect(html).toMatch(/title="[^"]*2026-11-14[^"]*DEVICE reading"/);
    expect(html).not.toMatch(/title="[^"]*2026-11-14[^"]*crew entry"/);
    expect(html).toContain('<span class="sr-only">, DEVICE reading</span>');
  });

  it("still labels manual entries as crew entries", () => {
    expect(html).toMatch(/title="[^"]*2026-11-13[^"]*crew entry"/);
    expect(html).toContain('<span class="sr-only">, crew entry</span>');
  });

  it("explains the non-crew marker only when such values are shown", () => {
    expect(html).toContain("data-feed readings, not crew entries");
    const manualOnly = grid([{ id: "sleepHours", cells: [null, { value: 7, source: "manual" }, { value: 7, source: "simulated" }] }]);
    expect(manualOnly).not.toContain("data-feed readings");
  });
});

describe("DailyGrid scroll region (#24)", () => {
  it("is a focusable, labelled region", () => {
    const html = grid([{ id: "mood", cells: [null, null, null] }]);
    expect(html).toMatch(/<div role="region" tabindex="0" aria-label="[^"]+"/);
  });
});

describe("CrewSwitcher status cue (#26)", () => {
  const crew = [
    { id: "cdr", name: "Commander" },
    { id: "plt", name: "Pilot" },
  ] as CrewMember[];

  it("renders a shape-coded status icon with a label, not a colour-only dot", () => {
    const html = renderToStaticMarkup(
      createElement(CrewSwitcher, { crew, active: "cdr", basePath: "/body", statuses: { cdr: "critical", plt: "caution" } }),
    );
    expect(html).not.toMatch(/rounded-full bg-/);
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Critical"|<svg[^>]*aria-label="Critical"[^>]*role="img"/i);
    expect(html).toMatch(/aria-label="Caution"/i);
    expect(html).toContain("lucide-octagon");
    expect(html).toContain("lucide-triangle");
  });
});
