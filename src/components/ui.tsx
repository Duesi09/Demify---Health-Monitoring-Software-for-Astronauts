import type { CSSProperties, ReactNode } from "react";
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

/** Shape per status level (shared by StatusBadge and status legends). */
export const STATUS_ICON = BADGE_ICON;

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
      className={`inline-flex shrink-0 items-center rounded-[3px] font-semibold leading-none ${dims} ${BADGE_STYLE[status]} ${flash && status ==="critical"?"alarm-flash":""} ${className}`}
    >
      <Icon size={size === "md" ? 13 : size === "xs" ? 10 : 11} strokeWidth={2.5} aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

const TAG_SIZE = {
  xs: "h-4 gap-1 px-1 text-[9.5px]",
  sm: "h-5 gap-1 px-1.5 text-[10.5px]",
  md: "h-7 gap-1.5 px-2.5 text-[11px]",
} as const;

/**
 * Class string for a neutral, squared tag: same geometry and type as
 * StatusBadge but on a quiet surface, for things that are not a status
 * (basis NASA/CLINICAL/APP, data source, accession numbers, filter chips,
 * hazard links). Use `tagClass` on links/buttons, `Tag` for plain labels.
 * Never add a coloured dot; if it carries a status, use StatusBadge.
 */
export function tagClass(size: keyof typeof TAG_SIZE = "sm", interactive = false): string {
  return `inline-flex shrink-0 items-center rounded-[3px] border border-border bg-surface-2 font-semibold leading-none text-muted ${TAG_SIZE[size]} ${
 interactive
 ?"transition-colors hover:border-muted/60 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
 :""
 }`;
}

/** Selected state for a squared filter chip (`aria-pressed`): inverted, not coloured. */
export const TAG_SELECTED ="border-fg! bg-fg! text-bg!";

/**
 * Squared segmented control in the monitor style: one bordered strip of
 * keys divided by hairlines, the selected key inverted (never a
 * floating rounded"pill"on a tray). Controlled and hook-free, so it can be
 * rendered from any client component.`role` picks the ARIA pattern:
 * "radiogroup" for a view/axis switch, "tablist" for switching content.
 * It is a grid with one column per option; pass e.g. `max-sm:grid-cols-2`
 * in `className` to fold long strips on phones (hairlines stay intact).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  role = "radiogroup",
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  role?: "radiogroup" | "tablist";
  className?: string;
}) {
  const itemRole = role === "tablist" ? "tab" : "radio";
  return (
    <div
      role={role}
      aria-label={label}
      aria-disabled={disabled || undefined}
      style={{ "--seg-cols": `repeat(${options.length}, auto)` } as CSSProperties}
      className={`grid max-w-full grid-cols-(--seg-cols) gap-px overflow-hidden rounded-[3px] border border-border bg-border ${disabled ? "opacity-45" : ""} ${className}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={itemRole}
            {...(itemRole === "tab" ? { "aria-selected": on } : { "aria-checked": on })}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap px-2.5 text-[11px] font-semibold leading-none transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed ${
 on ?"bg-fg text-bg":"bg-surface-2 text-muted hover:bg-surface hover:text-fg"
 }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tag({
  children,
  size = "sm",
  title,
  mono = false,
  className = "",
}: {
  children: ReactNode;
  size?: keyof typeof TAG_SIZE;
  title?: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <span title={title} className={`${tagClass(size)} ${mono ? "font-mono normal-case tracking-normal" : ""} ${className}`}>
      {children}
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.022em] md:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-muted">{description}</p>}
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
