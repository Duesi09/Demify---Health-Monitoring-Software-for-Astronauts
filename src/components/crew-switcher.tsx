import Link from "next/link";
import type { CrewMember, Status } from "@/lib/types";
import { STATUS_LABEL } from "./ui";
import { StatusIcon } from "./overview/status-icon";

/**
 * Crew selector rendered as links so it works without JS and keeps state in
 * the URL. By default each link is `<basePath>?crew=<id>`; pass `hrefFor` to
 * build other URLs (e.g. `/crew/<id>`). Pass `statuses` to show each member's
 * overall status as a shape-coded icon (never colour alone), and `tags` for a
 * short extra marker such as "Drill".
 */
export function CrewSwitcher({
  crew,
  active,
  basePath = "/",
  statuses,
  hrefFor,
  tags,
}: {
  crew: CrewMember[];
  active: string;
  basePath?: string;
  statuses?: Partial<Record<string, Status>>;
  hrefFor?: (id: string) => string;
  tags?: Partial<Record<string, string>>;
}) {
  return (
    <nav aria-label="Crew member" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
      {crew.map((c) => {
        const on = c.id === active;
        const st = statuses?.[c.id];
        const tag = tags?.[c.id];
        return (
          <Link
            key={c.id}
            href={hrefFor ? hrefFor(c.id) : `${basePath}?crew=${c.id}`}
            aria-current={on ? "true" : undefined}
            title={st ? `${c.name}: ${STATUS_LABEL[st]}${tag ? ` (${tag})` : ""}` : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
              on ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {/* Shape-coded icon (check / triangle / octagon) so status is never conveyed by colour alone. */}
            {st && <StatusIcon status={st} size={13} />}
            {c.name}
            {tag && (
              <span className="rounded-[3px] border border-current px-1 text-[9px] font-semibold uppercase leading-[14px] tracking-[0.08em]">
                {tag}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
