import type { CSSProperties } from "react";
import Link from "next/link";
import { LINK_PROFILES, LINK_PROFILE_IDS, withLink, type LinkProfileId } from "@/lib/link";

/**
 * Signal-delay selector: plain links that keep the current path (and its
 * other query parameters, e.g. ?crew=) and set ?link=<id>, so it works
 * without JavaScript and every server-rendered delay string on the page
 * changes together. Squared strip in the Segmented style; the current
 * profile is inverted and marked aria-current.
 */
export function LinkSwitch({
  active,
  path,
  query,
  className = "",
}: {
  active: LinkProfileId;
  /** Current path, e.g. "/" or "/crew/cdr". */
  path: string;
  /** Other query parameters to keep, e.g. { crew: "cdr" }. */
  query?: Record<string, string | undefined>;
  className?: string;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && k !== "link") params.set(k, v);
  const qs = params.toString();
  const base = qs ? `${path}?${qs}` : path;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className}`}>
      <span aria-hidden className="text-xs text-muted">
        Signal delay profile
      </span>
      <nav
        aria-label="Signal delay profile"
        style={{ "--seg-cols": `repeat(${LINK_PROFILE_IDS.length}, auto)` } as CSSProperties}
        className="grid max-w-full grid-cols-(--seg-cols) gap-px overflow-hidden rounded-[3px] border border-border bg-border max-sm:grid-cols-3"
      >
        {LINK_PROFILE_IDS.map((id) => {
          const on = id === active;
          return (
            <Link
              key={id}
              href={withLink(base, id)}
              scroll={false}
              aria-current={on ? "true" : undefined}
              className={`inline-flex h-7 items-center justify-center whitespace-nowrap px-2.5 text-[11px] font-semibold leading-none transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                on ? "bg-fg text-bg" : "bg-surface-2 text-muted hover:bg-surface hover:text-fg"
              }`}
            >
              {LINK_PROFILES[id].label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
