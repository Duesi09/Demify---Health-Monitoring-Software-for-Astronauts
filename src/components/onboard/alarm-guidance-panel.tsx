"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpenText, Clock, LoaderCircle, MessageSquareText, Siren, TriangleAlert } from "lucide-react";
import { StatusBadge, Tag } from "@/components/ui";
import {
  ALARM_PANEL_ID,
  BLACKOUT_STEP_NOTE,
  DRILL_TAG,
  EVENT_ACT_NOW,
  alarmEvents,
  flightSurgeonLine,
  type AlarmEvent,
  type AlarmGuidance,
  type AlarmGuidanceResponse,
  type AlarmWalkthrough,
} from "@/lib/assistant/alarm-events";
import { ASSISTANT_NOTICE } from "@/lib/assistant/wording";
import type { LinkProfileId } from "@/lib/link";
import { AnswerText, CitationItem } from "./answer-card";
import { capitalise, groundLinkView, utcTime } from "./format";
import { useActiveAlarms } from "./use-active-alarms";
import { useGroundLink } from "./use-ground-link";

/**
 * The assistant's response to the alarms Demify raised, on top of
 * /assistant: one panel per crew member in alarm (high priority first),
 * gone when the alarm ends. Each panel shows at once the act-now line and
 * the matching checklist passages from the library (fixed query, no model
 * call), then the local language model's walk-through of those passages
 * when a model runs. One walk-through per alarm: requested once (one at a
 * time for the whole page), reused when the page is opened again. Drills
 * are labelled as training scenarios. The assistant advises, never decides,
 * and never raises or clears an alarm.
 *
 * Polling: the shared GET /api/alarms store (also behind the nav "!");
 * GET /api/assistant/event is read only when the set of alarms changes.
 */

/** Wait before asking again while the model is busy with other questions. */
const BUSY_RETRY_MS = 15_000;
/** Wait after a failed request before asking again. */
const ERROR_RETRY_MS = 30_000;

type WalkState =
  | { phase: "pending"; since: number }
  | { phase: "done"; walkthrough: AlarmWalkthrough }
  | { phase: "retry"; at: number; why: "busy" | "error" };

/*
 * Finished walk-throughs live in this module, so they survive moving to
 * another page and back within this tab (the server keeps them as well).
 */
const finished = new Map<string, AlarmWalkthrough>();

const walkKey = (eventKey: string, blackout: boolean) => `${eventKey}|${blackout ? "down" : "up"}`;
const domId = (key: string) => `ev-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function seconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))} s`;
}

function eventHref(link: LinkProfileId | null): string {
  return `/api/assistant/event${link ? `?link=${encodeURIComponent(link)}` : ""}`;
}

/** The alarm panels (renders nothing while no alarm is active). */
export function AlarmGuidancePanels({ link = null }: { link?: LinkProfileId | null }) {
  const { alarms, scenarios } = useActiveAlarms();
  const events = useMemo(() => (alarms ? alarmEvents(alarms, scenarios) : []), [alarms, scenarios]);
  const keys = events.map((e) => e.key).join("\n");

  const [response, setResponse] = useState<AlarmGuidanceResponse | null>(null);
  const { state: linkState } = useGroundLink();
  const view = linkState ? groundLinkView(linkState, link) : null;
  const blackout = view ? view === "down" || view === "conjunction" : (response?.blackout ?? link === "conjunction");

  /* ---- instant guidance: read when the set of alarms changes -------------- */
  useEffect(() => {
    if (!keys) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(eventHref(link), { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) return;
        const body = (await res.json()) as AlarmGuidanceResponse;
        if (!ctrl.signal.aborted && Array.isArray(body.events)) setResponse(body);
      } catch {
        /* keep what is shown; the next alarm change reads again */
      }
    })();
    return () => ctrl.abort();
    // blackout: the passages of a blackout include the library's blackout flight-surgeon step.
  }, [keys, link, blackout]);

  const guidance = useMemo(() => {
    const map = new Map<string, AlarmGuidance>();
    for (const g of response?.events ?? []) map.set(g.event.key, g);
    return map;
  }, [response]);

  /* ---- walk-throughs: one request at a time, once per alarm and link mode -- */
  const [walks, setWalks] = useState<Record<string, WalkState>>({});
  const [tick, setTick] = useState(0);
  const linkRef = useRef(link);
  useEffect(() => {
    linkRef.current = link;
  }, [link]);

  const walkFor = (e: AlarmEvent): WalkState | null => {
    const k = walkKey(e.key, blackout);
    const done = finished.get(k);
    if (done) return { phase: "done", walkthrough: done };
    const fromServer = guidance.get(e.key)?.walkthrough;
    if (fromServer && fromServer.groundLink === (blackout ? "down" : "up")) return { phase: "done", walkthrough: fromServer };
    return walks[k] ?? null;
  };

  const modelReady = response?.model.ready === true;
  useEffect(() => {
    if (!modelReady || !events.length) return;
    const states = events.map((e) => ({ e, s: walkFor(e) }));
    if (states.some((x) => x.s?.phase === "pending")) return;
    const now = Date.now();
    const next = states.find((x) => guidance.get(x.e.key)?.citations.length && (!x.s || (x.s.phase === "retry" && x.s.at <= now)));
    if (!next) {
      // Wake up for the earliest retry.
      const retryAt = Math.min(...states.map((x) => (x.s?.phase === "retry" ? x.s.at : Infinity)));
      if (!Number.isFinite(retryAt)) return;
      const id = setTimeout(() => setTick((t) => t + 1), Math.max(250, retryAt - now));
      return () => clearTimeout(id);
    }
    const k = walkKey(next.e.key, blackout);
    const eventKey = next.e.key;
    // Not aborted on cleanup: the effect runs again as soon as the request is marked pending, and the
    // request must go on (the server shares one model call per alarm; a late answer is kept in `finished`).
    const id = setTimeout(() => {
      setWalks((w) => ({ ...w, [k]: { phase: "pending", since: Date.now() } }));
      void (async () => {
        let state: WalkState;
        try {
          const res = await fetch("/api/assistant/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: eventKey, ...(linkRef.current ? { link: linkRef.current } : {}) }),
          });
          if (res.status === 409) return; // the alarm ended; its panel goes with the next poll
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as { walkthrough?: AlarmWalkthrough };
          const w = body.walkthrough;
          if (!w) throw new Error("no walk-through");
          if (w.status === "busy") state = { phase: "retry", at: Date.now() + BUSY_RETRY_MS, why: "busy" };
          else {
            finished.set(k, w);
            state = { phase: "done", walkthrough: w };
          }
        } catch {
          state = { phase: "retry", at: Date.now() + ERROR_RETRY_MS, why: "error" };
        }
        setWalks((w) => ({ ...w, [k]: state }));
      })();
    }, 0);
    return () => clearTimeout(id);
    // walkFor reads walks, guidance and blackout (all listed); tick wakes it for retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelReady, keys, guidance, walks, blackout, tick]);

  /* ---- a running clock for "preparing … s" --------------------------------- */
  const anyPending = events.some((e) => walkFor(e)?.phase === "pending");
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyPending]);

  if (!events.length) return null;

  return (
    <section id={ALARM_PANEL_ID} aria-labelledby="alarm-guidance-heading" className="scroll-mt-20 space-y-4">
      <h2 id="alarm-guidance-heading" className="sr-only">
        Guidance for the active alarms
      </h2>
      {events.map((e, i) => (
        <EventPanel
          key={e.key}
          event={e}
          guidance={guidance.get(e.key) ?? null}
          walk={walkFor(e)}
          blackout={blackout}
          model={response?.model ?? null}
          at={response?.at ?? ""}
          queued={i > 0 && events.slice(0, i).some((p) => walkFor(p)?.phase === "pending")}
          now={now}
        />
      ))}
    </section>
  );
}

function EventPanel({
  event,
  guidance,
  walk,
  blackout,
  model,
  queued,
  now,
  at,
}: {
  at: string;
  event: AlarmEvent;
  guidance: AlarmGuidance | null;
  walk: WalkState | null;
  blackout: boolean;
  model: AlarmGuidanceResponse["model"] | null;
  queued: boolean;
  now: number;
}) {
  const id = domId(event.key);
  const high = event.level === "high";
  const citations = guidance?.citations ?? [];
  return (
    <article
      aria-labelledby={`${id}-heading`}
      className={`rounded-xl border bg-surface p-4 md:p-5 ${high ? "border-critical/60 border-l-4 border-l-critical" : "border-caution/70 border-l-4 border-l-caution"}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Siren size={20} aria-hidden className={high ? "text-critical" : "text-caution"} />
            <span className="min-w-0">{event.title}</span>
          </h3>
          <p className="mt-0.5 text-sm text-muted">
            {event.crewName} · the assistant responds to the alarm Demify raised
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={high ? "critical" : "caution"} label={high ? "High priority" : "Medium priority"} size="xs" />
          {event.drill && (
            <Tag size="xs" title="Simulated drill, not a real emergency">
              {DRILL_TAG}
            </Tag>
          )}
        </div>
      </header>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[12.5px] font-semibold text-fg" aria-label="Alarms">
        {event.alarms.map((a) => (
          <li key={a.id}>
            <span className="sr-only">{a.priority === "high" ? "High priority: " : "Medium priority: "}</span>
            {a.priority === "high" ? "***" : "**"} {a.text}
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-lg border border-critical/60 bg-critical/[0.07] px-3 py-3">
        <p className="text-[17px] font-semibold leading-snug md:text-lg">{EVENT_ACT_NOW}</p>
        <p className="mt-1 text-sm leading-snug">{flightSurgeonLine(blackout)}</p>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby={`${id}-passages`} className="min-w-0">
          <h4 id={`${id}-passages`} className="flex items-center gap-1.5 text-sm font-semibold">
            <BookOpenText size={15} aria-hidden className="text-accent" />
            Checklist passages from the library{citations.length ? ` (${citations.length})` : ""}
          </h4>
          {!guidance ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <LoaderCircle size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />
              Reading the onboard library…
            </p>
          ) : citations.length ? (
            <>
              <p className="mt-1 text-xs leading-snug text-muted">
                Found at once with a fixed query from the alarm{guidance.query ? ` (“${guidance.query}”)` : ""}, no language model.
              </p>
              <ol className="mt-2 space-y-2">
                {citations.map((c) => (
                  <CitationItem key={c.n} c={c} prefix={id} askedAt={at} />
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed">
              The onboard library has no checklist passage for this alarm. Follow the onboard medical checklist.
            </p>
          )}
          {guidance && (
            <p className="mt-2 text-[12px] leading-snug text-muted">
              <Clock size={12} aria-hidden className="mr-1.5 inline align-[-1px]" />
              Library: {guidance.freshness.libraryAgeText}
              {guidance.freshness.stale && <StatusBadge status="caution" label="Library may be out of date" size="xs" className="ml-2 align-middle" />}
            </p>
          )}
          {guidance && guidance.integrityFailures > 0 && (
            <p className="mt-2 flex items-start gap-2 text-sm">
              <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0 text-caution" />
              {guidance.integrityFailures === 1 ? "1 library passage was" : `${guidance.integrityFailures} library passages were`} left out
              because the stored checksum did not match.
            </p>
          )}
        </section>

        <Walkthrough
          id={id}
          walk={walk}
          model={model}
          citations={citations}
          hasGuidance={!!guidance}
          queued={queued}
          now={now}
          blackout={blackout}
        />
      </div>

      <p className="mt-3 border-t border-border pt-2.5 text-[11px] leading-snug text-muted">{ASSISTANT_NOTICE}</p>
    </article>
  );
}

function Walkthrough({
  id,
  walk,
  model,
  citations,
  hasGuidance,
  queued,
  now,
  blackout,
}: {
  blackout: boolean;
  id: string;
  walk: WalkState | null;
  model: AlarmGuidanceResponse["model"] | null;
  citations: AlarmGuidance["citations"];
  hasGuidance: boolean;
  queued: boolean;
  now: number;
}) {
  let body: ReactNode;
  let footer: string | null = null;
  if (!hasGuidance || !model) {
    body = <p className="text-sm text-muted">Waiting for the checklist passages.</p>;
  } else if (!citations.length) {
    body = <p className="text-sm text-muted">Nothing to walk through: the library has no passage for this alarm.</p>;
  } else if (walk?.phase === "done") {
    const w = walk.walkthrough;
    if (w.status === "answered" && w.answer) {
      body = (
        <>
          <AnswerText text={w.answer} prefix={id} citations={citations} hasCrew={false} />
          {blackout && <p className="mt-2 text-sm font-medium leading-snug">{BLACKOUT_STEP_NOTE}</p>}
        </>
      );
      footer = `Written by ${w.model ?? "the local language model"} in ${seconds(w.elapsedMs)} from the passages it cites, ${utcTime(w.finishedAt)}. Ground link ${w.groundLink === "up" ? "up" : "down (no contact)"} when written.`;
    } else if (w.status === "no-answer") {
      body = <p className="text-sm leading-relaxed">The language model found nothing to add to these passages. The checklist passages are the guidance.</p>;
    } else {
      body = (
        <p className="text-sm leading-relaxed">
          {w.reason ?? "No walk-through."} The checklist passages are the guidance.
        </p>
      );
    }
  } else if (!model.ready) {
    body = (
      <p className="text-sm leading-relaxed">
        {model.reason ?? "No language model is set up on this machine."} The checklist passages are the guidance.
      </p>
    );
  } else if (walk?.phase === "pending") {
    body = (
      <p className="flex items-start gap-2 text-sm leading-relaxed">
        <LoaderCircle size={15} aria-hidden className="mt-0.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" />
        <span>
          The local language model ({model.name}) is preparing a walk-through of these passages
          {now > walk.since ? `: ${seconds(now - walk.since)}` : ""}. On a laptop without a GPU it can take a minute or more;
          the checklist passages already apply.
        </span>
      </p>
    );
  } else if (walk?.phase === "retry") {
    body = (
      <p className="text-sm leading-relaxed">
        {walk.why === "busy"
          ? "The language model is answering other questions; the walk-through starts in a moment."
          : "The walk-through could not be requested; it is tried again in a moment."}{" "}
        The checklist passages already apply.
      </p>
    );
  } else {
    body = (
      <p className="text-sm leading-relaxed text-muted">
        {queued ? "Queued: the walk-through starts when the one above is finished." : "The walk-through starts in a moment."}
      </p>
    );
  }
  return (
    <section aria-labelledby={`${id}-walk`} className="min-w-0 rounded-lg border border-border bg-surface-2/40 p-3 md:p-4">
      <h4 id={`${id}-walk`} className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquareText size={15} aria-hidden className="text-accent" />
        Walk-through (local language model)
      </h4>
      <div className="mt-2" aria-live="polite">
        {body}
      </div>
      {footer && <p className="mt-2 text-[11px] leading-snug text-muted">{capitalise(footer)}</p>}
    </section>
  );
}
