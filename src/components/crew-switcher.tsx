import Link from "next/link";
import type { CrewMember, Status } from "@/lib/types";
import { StatusIcon } from "./overview/status-icon";

/**
 * Crew selector rendered as links (?crew=<id>) so it works without JS and
 * keeps state in the URL. Pass `statuses` to show each member's overall status.
 */
export function CrewSwitcher({
  crew,
  active,
  basePath,
  statuses,
}: {
  crew: CrewMember[];
  active: string;
  basePath: string;
  statuses?: Partial<Record<string, Status>>;
}) {
  return (
    <nav aria-label="Crew member" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
      {crew.map((c) => {
        const on = c.id === active;
        const st = statuses?.[c.id];
        return (
          <Link
            key={c.id}
            href={`${basePath}?crew=${c.id}`}
            aria-current={on ? "true" : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
              on ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {/* Shape-coded icon (not a colour-only dot) so status is never conveyed by colour alone. */}
            {st && <StatusIcon status={st} size={13} />}
            {c.name}
          </Link>
        );
      })}
    </nav>
  );
}
