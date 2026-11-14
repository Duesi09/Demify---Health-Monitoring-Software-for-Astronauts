import type { ReactNode } from "react";
import { Check, Minus, OctagonAlert, TriangleAlert } from "lucide-react";
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

const BADGE_STYLE: Record<Status, string> = {
  nominal: "text-nominal bg-nominal/10 ring-1 ring-inset ring-nominal/30",
  caution: "bg-caution-fill text-on-caution",
  critical: "bg-critical-fill text-on-critical",
  unknown: "text-muted bg-surface-2 ring-1 ring-inset ring-border",
};

const BADGE_ICON: Record<Status, typeof Check> = {
  nominal: Check,
  caution: TriangleAlert,
  critical: OctagonAlert,
  unknown: Minus,
};

/**
 * Status label in the style of a patient-monitor alarm indicator: squared,
 * uppercase, with a distinct shape per level so status is never colour-only.
 * Caution and critical use solid alarm fills; `flash` makes a critical badge
 * blink like an active high-priority alarm. Use this everywhere instead of
 * ad-hoc rounded pills.
 */
export function StatusBadge({
  status,
  label,
  size = "sm",
  flash = false,
  className = "",
}: {
  status: Status;
  /** Override the text (e.g. "S3" or "Drill"); the status shape stays. */
  label?: string;
  size?: "xs" | "sm" | "md";
  flash?: boolean;
  className?: string;
}) {
  const Icon = BADGE_ICON[status];
  const dims =
    size === "xs"
      ? "h-4 gap-1 px-1 text-[9.5px]"
      : size === "md"
        ? "h-6 gap-1.5 px-2 text-[11.5px]"
        : "h-5 gap-1 px-1.5 text-[10.5px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[3px] font-semibold uppercase leading-none tracking-[0.07em] ${dims} ${BADGE_STYLE[status]} ${flash && status === "critical" ? "alarm-flash" : ""} ${className}`}
    >
      <Icon size={size === "md" ? 13 : size === "xs" ? 10 : 11} strokeWidth={2.5} aria-hidden />
      {label ?? STATUS_LABEL[status]}
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
