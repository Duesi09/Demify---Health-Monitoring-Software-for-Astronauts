"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Ban, BookOpenText, ChevronDown, Clock, ExternalLink, MessageSquareText, SearchX, ShieldCheck, Siren, TriangleAlert } from "lucide-react";
import { StatusBadge, Tag } from "@/components/ui";
import type { AssistantAnswer, Citation } from "@/lib/onboard/types";
import {
  CATEGORY_LABEL,
  STATUS_HEADING,
  answerBlocks,
  citationTitle,
  freshnessLine,
  modeLine,
  shortVersion,
  splitActNow,
  splitMarkers,
  utcTime,
  type Inline,
} from "./format";

export interface AnswerEntry {
  /** Unique within this browser session ("a1", "a2", …); prefixes every id in the card. */
  key: string;
  question: string;
  answer: AssistantAnswer;
}

const STATUS_ICON = {
  answered: MessageSquareText,
  "passages-only": BookOpenText,
  "no-answer": SearchX,
  blocked: Ban,
} as const;

/** Renders split answer text as React nodes: text stays text, [n] becomes a link to its citation. */
function InlineText({ parts, prefix, citations }: { parts: Inline[]; prefix: string; citations: Citation[] }) {
  return (
    <>
      {parts.map((p, i): ReactNode => {
        if (p.kind === "text") return p.text;
        if (p.kind === "strong")
          return (
            <strong key={i} className="font-semibold">
              <InlineText parts={p.children} prefix={prefix} citations={citations} />
            </strong>
          );
        if (p.kind === "crew")
          return (
            <a
              key={i}
              href={`#${prefix}-crew`}
              className="mx-px inline-flex h-4 items-center rounded-[3px] border border-border bg-surface-2 px-1 align-[1px] font-mono text-[10.5px] font-semibold text-accent no-underline hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Crew data used as context"
            >
              C
            </a>
          );
        const c = citations.find((x) => x.n === p.n);
        return (
          <a
            key={i}
            href={`#${prefix}-cite-${p.n}`}
            className="mx-px inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border bg-surface-2 px-1 align-[1px] font-mono text-[10.5px] font-semibold text-accent no-underline hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={c ? `Source ${p.n}: ${citationTitle(c)}` : `Source ${p.n}`}
            title={c ? citationTitle(c) : undefined}
          >
            {p.n}
          </a>
        );
      })}
    </>
  );
}

/** Paragraphs and "- " lists of the answer text, rendered as React elements (never as HTML). */
function AnswerText({ text, prefix, citations, hasCrew }: { text: string; prefix: string; citations: Citation[]; hasCrew: boolean }) {
  const known = citations.map((c) => c.n);
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed">
      {answerBlocks(text).map((b, i) => {
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind;
          return (
            <List key={i} className={`space-y-1 pl-5 ${b.kind === "ul" ? "list-disc" : "list-decimal"} marker:text-muted`}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <InlineText parts={splitMarkers(item, known, hasCrew)} prefix={prefix} citations={citations} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className={b.kind === "h" ? "font-semibold" : undefined}>
            <InlineText parts={splitMarkers(b.text, known, hasCrew)} prefix={prefix} citations={citations} />
          </p>
        );
      })}
    </div>
  );
}

function CitationItem({ c, prefix }: { c: Citation; prefix: string }) {
  return (
    <li
      id={`${prefix}-cite-${c.n}`}
      className="scroll-mt-24 rounded-lg border border-border bg-surface-2/40 p-3 target:border-accent target:ring-2 target:ring-accent/30"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs font-semibold text-accent">[{c.n}]</span>
        <span className="min-w-0 text-sm font-medium">{citationTitle(c)}</span>
        <Tag size="xs">{CATEGORY_LABEL[c.category] ?? c.category}</Tag>
      </div>
      <p className="mt-1 text-xs text-muted">
        {c.source}
        {" · "}
        {c.reviewed ?? "Review status not stated"}
      </p>
      <blockquote className="mt-2 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-fg/90">{c.excerpt}</blockquote>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          Version <span className="font-mono">{shortVersion(c.version)}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-nominal">
          <ShieldCheck size={12} aria-hidden />
          checksum verified
        </span>
        {c.syncedAt && <span>synced {utcTime(c.syncedAt)}</span>}
        {c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline underline-offset-2">
            Source document
            <ExternalLink size={10} aria-hidden />
          </a>
        )}
      </p>
    </li>
  );
}

/**
 * One answer of the onboard assistant: status heading, the act-now line
 * when the question names an emergency, the answer (or the reason there is
 * none), the freshness and mode lines, the crew data used and the cited
 * library passages with their version and checksum.
 */
export function AnswerCard({ entry, focusOnMount = false }: { entry: AnswerEntry; focusOnMount?: boolean }) {
  const { key, question, answer } = entry;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const Icon = STATUS_ICON[answer.status];
  const body = splitActNow(answer.status === "answered" ? answer.answer : answer.reason);
  const hasCrew = !!answer.crewContext;
  /** The answer cites the crew data ([C]): show it open. */
  const citesCrew = hasCrew && /\[\s*[Cc]\s*\]/.test(body.rest);
  const showPassagesNote = answer.status === "passages-only" && answer.citations.length > 0;

  return (
    <article aria-labelledby={`${key}-heading`} className="rounded-xl border border-border bg-surface p-4 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h3
          id={`${key}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-base font-semibold tracking-tight focus:outline-none"
        >
          <Icon size={18} aria-hidden className={answer.status === "answered" ? "text-accent" : "text-muted"} />
          {STATUS_HEADING[answer.status]}
        </h3>
        <span className="text-xs tabular text-muted">Asked {utcTime(answer.askedAt)}</span>
      </header>
      <p className="mt-1 text-sm text-muted">
        <span className="sr-only">Question: </span>“{question}”
        {answer.crewContext && <span> · {answer.crewContext.crewName}</span>}
      </p>

      {body.actNow && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-critical/60 border-l-4 border-l-critical bg-critical/[0.07] px-3 py-2.5">
          <Siren size={18} aria-hidden className="mt-0.5 shrink-0 text-critical" />
          <p className="text-[15px] font-semibold leading-snug">{body.actNow}</p>
        </div>
      )}

      <div className="mt-3">
        {answer.status === "answered" ? (
          <AnswerText text={body.rest} prefix={key} citations={answer.citations} hasCrew={hasCrew} />
        ) : (
          body.rest && <p className="text-[15px] leading-relaxed">{body.rest}</p>
        )}
        {showPassagesNote && (
          <p className="mt-2 text-sm text-muted">
            The {answer.citations.length === 1 ? "passage" : "passages"} below matched the question. Read them yourself; nothing was
            written by a model.
          </p>
        )}
      </div>

      <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-[12px] leading-snug text-muted">
        <p>
          <Clock size={12} aria-hidden className="mr-1.5 inline align-[-1px]" />
          {freshnessLine(answer)}
          {answer.freshness.stale && <StatusBadge status="caution" label="Library may be out of date" size="xs" className="ml-2 align-middle" />}
        </p>
        <p>{modeLine(answer)}</p>
        {answer.mode.fallbackReason && <p className="text-[11px]">Fallback: {answer.mode.fallbackReason}</p>}
        <p className="text-[11px]">{answer.notice}</p>
      </div>

      {answer.crewContext && (
        <details
          id={`${key}-crew`}
          open={citesCrew}
          className="group/crew mt-3 scroll-mt-24 rounded-lg border border-border bg-surface-2/40 target:border-accent"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded-lg p-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-accent">[C]</span>
              Crew data used as context: {answer.crewContext.crewName}
              <Tag size="xs">{answer.crewContext.source}</Tag>
              {answer.crewContext.takenAt && (
                <span className="font-normal text-muted">{utcTime(answer.crewContext.takenAt, answer.askedAt)}</span>
              )}
            </span>
            <ChevronDown size={14} aria-hidden className="mt-0.5 shrink-0 text-muted transition-transform group-open/crew:rotate-180" />
          </summary>
          <p className="-mt-1 px-3 pb-3 text-[13px] leading-relaxed text-fg/90">{answer.crewContext.summary}</p>
        </details>
      )}

      {answer.integrityFailures > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-caution/60 bg-caution/[0.07] px-3 py-2 text-sm">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-caution" />
          <p>
            {answer.integrityFailures === 1 ? "1 library passage was" : `${answer.integrityFailures} library passages were`} left out
            because the stored checksum did not match. Sync the library again from the ground to restore {answer.integrityFailures === 1 ? "it" : "them"}.
          </p>
        </div>
      )}

      {answer.citations.length > 0 && (
        <section aria-labelledby={`${key}-sources`} className="mt-4">
          <h4 id={`${key}-sources`} className="text-xs font-semibold text-muted">
            Library passages cited ({answer.citations.length})
          </h4>
          <ol className="mt-2 space-y-2">
            {answer.citations.map((c) => (
              <CitationItem key={c.n} c={c} prefix={key} />
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
