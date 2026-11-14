import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  CATEGORY_LABEL,
  MED_KIT_NOTE,
  SYNC_STATUS,
  SYNC_TRIGGER_LABEL,
  capitalise,
  databaseText,
  durationText,
  expiryState,
  quantityText,
  shortVersion,
  syncDetailText,
  utcDateTime,
} from "@/components/onboard/format";
import { SyncPanel } from "@/components/onboard/sync-panel";
import { Card, PageHeader, StatusBadge, Tag } from "@/components/ui";
import { libraryListing } from "@/lib/assistant/library-source";
import { onboardStatus } from "@/lib/assistant/status";

export const metadata: Metadata = { title: "Onboard library" };
export const dynamic = "force-dynamic";

/** Today's date (UTC) for the expiry column. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Horizontally scrollable, focusable table region (phones). */
function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="region" tabIndex={0} aria-label={label} className="-mx-1 overflow-x-auto px-1 focus-visible:outline-2 focus-visible:outline-accent">
      {children}
    </div>
  );
}

const TH = "py-1.5 pr-4 text-left text-xs font-normal text-muted whitespace-nowrap";
const TD = "py-2 pr-4 align-top";

export default async function LibraryPage() {
  // Same functions as GET /api/library and GET /api/onboard/status.
  const [listing, status] = await Promise.all([libraryListing(), onboardStatus()]);
  const today = todayUtc();
  const fromDb = listing.source === "database";
  const chunks = listing.documents.reduce((n, d) => n + d.chunks, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboard library"
        description="The curated library the onboard assistant answers from: procedures, reference ranges, crew baselines and the medical-kit inventory. Each document names its source and review status and carries a version (SHA-256 of its text); every passage is checked against its checksum before the assistant uses it."
      >
        <Tag size="md">{fromDb ? "Source: onboard database" : "Source: bundled with this release"}</Tag>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Freshness">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tracking-tight">{capitalise(listing.freshness.libraryAgeText)}</p>
            {listing.freshness.stale && <StatusBadge status="caution" label="May be out of date" size="md" />}
          </div>
          {listing.freshness.librarySyncedAt && fromDb && (
            <p className="mt-1 text-sm tabular text-muted">{utcDateTime(listing.freshness.librarySyncedAt)}</p>
          )}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Documents</dt>
              <dd className="text-xl font-semibold tabular">{listing.documents.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Passages (chunks)</dt>
              <dd className="text-xl font-semibold tabular">{chunks}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Medical-kit items</dt>
              <dd className="text-xl font-semibold tabular">{listing.inventory.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Database</dt>
              <dd className="font-medium">{databaseText(status.database)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {fromDb
              ? `The sync service pulls the ground library daily and every ${status.syncIntervalHours} h while the ground link is up; during a blackout the crew works from this copy. A library older than a day is marked as possibly out of date.`
              : "No onboard database on this machine: the assistant reads the library files bundled with this release, with keyword search. On the onboard server the library lives in PostgreSQL and syncs from the ground."}
            {status.library.pendingEmbeddings > 0 &&
              ` ${status.library.pendingEmbeddings} passages wait for embedding; full-text search covers them meanwhile.`}
          </p>
        </Card>

        <Card title="Sync from the ground">
          <SyncPanel initialLink={status.groundLink} database={status.database} />
        </Card>
      </div>

      <Card title="Documents" subtitle="Ordered by category. Version = first 8 characters of the document's SHA-256.">
        {listing.documents.length ? (
          <TableRegion label="Library documents">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Title</th>
                  <th className={TH}>Category</th>
                  <th className={TH}>Source</th>
                  <th className={TH}>Review status</th>
                  <th className={TH}>Version</th>
                  <th className={TH}>Synced</th>
                  <th className={`${TH} pr-0 text-right`}>Passages</th>
                </tr>
              </thead>
              <tbody>
                {listing.documents.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className={`${TD} font-medium`}>
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                          {d.title}
                          <ExternalLink size={11} aria-hidden className="text-muted" />
                        </a>
                      ) : (
                        d.title
                      )}
                      {d.updated && <span className="block text-xs font-normal text-muted">Updated {d.updated}</span>}
                    </td>
                    <td className={TD}>
                      <Tag size="xs">{CATEGORY_LABEL[d.category] ?? d.category}</Tag>
                    </td>
                    <td className={`${TD} text-muted`}>{d.source}</td>
                    <td className={`${TD} text-muted`}>{d.reviewed ?? "Not stated"}</td>
                    <td className={`${TD} font-mono text-xs`} title={d.version}>
                      {shortVersion(d.version)}
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular text-muted`}>{d.syncedAt ? utcDateTime(d.syncedAt) : "Bundled"}</td>
                    <td className={`${TD} pr-0 text-right tabular`}>{d.chunks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        ) : (
          <p className="text-sm text-muted">
            The library is empty. {fromDb ? "Sync it from the ground when the ground link is up." : "No library files were found in this release."}
          </p>
        )}
      </Card>

      <Card title="Medical-kit inventory" subtitle={`${MED_KIT_NOTE} Devices and supplies; no medicines.`}>
        {listing.inventory.length ? (
          <TableRegion label="Medical-kit inventory">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Name</th>
                  <th className={TH}>Category</th>
                  <th className={TH}>Location</th>
                  <th className={TH}>Quantity</th>
                  <th className={`${TH} pr-0`}>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {listing.inventory.map((item) => {
                  const expiry = expiryState(item.expiresOn, today);
                  const note = item.notes?.replace(/Representative training inventory, not the real ISS kit\.\s*/i, "").trim();
                  return (
                    <tr key={item.id} className="border-t border-border">
                      <td className={`${TD} font-medium`}>
                        {item.name}
                        {note && <span className="block text-xs font-normal text-muted">{note}</span>}
                      </td>
                      <td className={`${TD} text-muted`}>{capitalise(item.category)}</td>
                      <td className={`${TD} text-muted`}>{item.location ?? "—"}</td>
                      <td className={`${TD} whitespace-nowrap tabular`}>{quantityText(item)}</td>
                      <td className={`${TD} whitespace-nowrap pr-0 tabular`}>
                        {item.expiresOn ?? <span className="text-muted">—</span>}
                        {expiry === "expired" && <StatusBadge status="caution" label="Expired" size="xs" className="ml-2" />}
                        {expiry === "soon" && <StatusBadge status="caution" label="Within 30 days" size="xs" className="ml-2" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableRegion>
        ) : (
          <p className="text-sm text-muted">No inventory in the library.</p>
        )}
      </Card>

      <Card title="Sync history" subtitle={fromDb ? "Newest first, library and data-snapshot syncs" : undefined}>
        {listing.syncRuns.length ? (
          <TableRegion label="Sync history">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr>
                  <th className={TH}>Kind</th>
                  <th className={TH}>Trigger</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Started</th>
                  <th className={TH}>Duration</th>
                  <th className={`${TH} pr-0`}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {listing.syncRuns.map((r, i) => (
                  <tr key={r.id ?? `${r.kind}-${r.startedAt}-${i}`} className="border-t border-border">
                    <td className={`${TD} whitespace-nowrap`}>{r.kind === "library" ? "Library" : "Data snapshots"}</td>
                    <td className={`${TD} whitespace-nowrap text-muted`}>{SYNC_TRIGGER_LABEL[r.trigger] ?? capitalise(r.trigger)}</td>
                    <td className={TD}>
                      <StatusBadge status={SYNC_STATUS[r.status].status} label={SYNC_STATUS[r.status].label} size="xs" />
                    </td>
                    <td className={`${TD} whitespace-nowrap tabular text-muted`}>{utcDateTime(r.startedAt)}</td>
                    <td className={`${TD} whitespace-nowrap tabular text-muted`}>{durationText(r.startedAt, r.finishedAt)}</td>
                    <td className={`${TD} pr-0 text-muted`}>{syncDetailText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        ) : (
          <p className="text-sm text-muted">
            {fromDb
              ? "No sync has run yet."
              : "No sync runs on this machine: without a database the library is the copy bundled with this release."}
          </p>
        )}
      </Card>
    </div>
  );
}
