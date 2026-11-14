import type { ReactNode } from "react";
import type { SourceResult, Status } from "@/lib/types";

/** Shared presentational primitives. Server- and client-safe (no hooks). */

export const STATUS_LABEL: Record<Status, string> = {
  nominal: "Nominal",
  caution: "Caution",
  critical: "Critical",
  unknown: "No data",
};

export const STATUS_TEXT: Record<Status, string> = {
  nominal: "text-nominal",
  caution: "text-caution",
  critical: "text-critical",
  unknown: "text-unknown",
};

export const STATUS_BG: Record<Status, string> = {
  nominal: "bg-nominal",
  caution: "bg-caution",
  critical: "bg-critical",
  unknown: "bg-unknown",
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-current/30 px-2 py-0.5 text-xs font-medium ${STATUS_TEXT[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_BG[status]}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Shows where data came from and how fresh it is. Always render this next to external data. */
export function Provenance({ result }: { result: Pick<SourceResult<unknown>, "source" | "freshness" | "fetchedAt" | "error"> }) {
  const color =
    result.freshness === "live" ? "text-nominal" : result.freshness === "cache" ? "text-accent" : "text-caution";
  return (
    <p className="text-[11px] text-muted" title={result.error}>
      Source: {result.source} ·{" "}
      <span className={color}>{result.freshness === "snapshot" ? "offline snapshot" : result.freshness}</span> ·{" "}
      {new Date(result.fetchedAt).toISOString().replace("T", " ").slice(0, 16)} UTC
    </p>
  );
}
