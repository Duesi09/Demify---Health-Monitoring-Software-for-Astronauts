"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { ArrowRight, BookOpenText, ChevronDown, Cpu, Database, LoaderCircle, Search, SatelliteDish, Send } from "lucide-react";
import { Card, StatusBadge, TAG_SELECTED, tagClass } from "@/components/ui";
import { withLink, type LinkProfileId } from "@/lib/link";
import type { AssistantAnswer, GroundLinkState, OnboardStatus } from "@/lib/onboard/types";
import type { Status } from "@/lib/types";
import { AnswerCard, type AnswerEntry } from "./answer-card";
import {
  EXAMPLE_QUESTIONS,
  OUT_OF_LIBRARY_EXAMPLE,
  QUESTION_MAX,
  STATUS_HEADING,
  capitalise,
  databaseText,
  groundLinkMeaning,
  groundLinkView,
  hostText,
  modelReady,
  modelStateStatus,
  modelStateText,
  questionProblem,
  retrievalText,
  utcTime,
  type GroundLinkView,
} from "./format";
import { GroundLinkBadge } from "./ground-link-indicators";
import { GroundLinkSwitch, responseError } from "./ground-link-switch";
import { useGroundLink } from "./use-ground-link";

export interface CrewOption {
  id: string;
  name: string;
  role: string;
}

/** Answers kept in this browser session (newest first). */
const HISTORY_MAX = 5;

/*
 * The answers live in this module (not in component state), so they survive
 * moving to another page and back within this browser tab; a reload starts
 * empty. Nothing is stored on the server or in browser storage.
 */
const NO_ANSWERS: AnswerEntry[] = [];
let sessionAnswers: AnswerEntry[] = NO_ANSWERS;
let answerSeq = 0;
const answerListeners = new Set<() => void>();

function addAnswer(question: string, answer: AssistantAnswer): AnswerEntry {
  answerSeq += 1;
  const entry: AnswerEntry = { key: `a${answerSeq}`, question, answer };
  sessionAnswers = [entry, ...sessionAnswers].slice(0, HISTORY_MAX);
  answerListeners.forEach((l) => l());
  return entry;
}

function subscribeAnswers(listener: () => void): () => void {
  answerListeners.add(listener);
  return () => {
    answerListeners.delete(listener);
  };
}

function useSessionAnswers(): AnswerEntry[] {
  return useSyncExternalStore(
    subscribeAnswers,
    () => sessionAnswers,
    () => NO_ANSWERS,
  );
}
const STATUS_POLL_MS = 60_000;

const MODEL_BADGE: Record<OnboardStatus["model"]["state"], string> = {
  ready: "Ready",
  "missing-models": "Not loaded",
  unreachable: "Offline",
  "not-configured": "None",
};
const DATABASE_BADGE: Record<OnboardStatus["database"], { status: Status; label: string }> = {
  connected: { status: "nominal", label: "Connected" },
  unreachable: { status: "caution", label: "Unreachable" },
  "not-configured": { status: "unknown", label: "None" },
};

function Cell({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </p>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </div>
  );
}

/** How the library keeps up to date, for the status strip. */
function librarySyncText(status: OnboardStatus, view: GroundLinkView): string {
  if (status.library.source === "bundled") return "the copy bundled with this release";
  if (view === "down") return "syncs paused while the ground link is down";
  if (view === "conjunction") return "syncs paused: no contact in the conjunction profile";
  if (view === "air-gapped") return "no sync in this air-gapped deployment";
  return `syncs every ${status.syncIntervalHours} h while the ground link is up`;
}

/** Ground link, library freshness, model, database and retrieval mode of the onboard server. */
function StatusStrip({
  status,
  linkState,
  link,
  onLinkChanged,
}: {
  status: OnboardStatus;
  linkState: GroundLinkState;
  /** The page's signal delay profile (?link=). */
  link: LinkProfileId | null;
  onLinkChanged: (s: GroundLinkState) => void;
}) {
  const lib = status.library;
  const view = groundLinkView(linkState, link);
  const ready = modelReady(status.model, status.database);
  return (
    <Card title="Onboard server">
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_repeat(4,minmax(0,1fr))]">
        <Cell label="Ground link" icon={<SatelliteDish size={14} aria-hidden />}>
          <GroundLinkBadge view={view} size="md" />
          <GroundLinkSwitch initial={linkState} link={link} onChanged={onLinkChanged} />
          <p className="text-xs leading-snug text-muted">{groundLinkMeaning(view, status.database)}</p>
        </Cell>
        <Cell label="Library" icon={<BookOpenText size={14} aria-hidden />}>
          <p className="text-sm font-medium">{capitalise(lib.freshness.libraryAgeText)}</p>
          {lib.freshness.stale && <StatusBadge status="caution" label="May be out of date" size="xs" />}
          <p className="text-xs leading-snug text-muted">
            {lib.documents} documents, {lib.chunks} passages · {librarySyncText(status, view)}
          </p>
          <Link
            href={withLink("/library", link)}
            className="inline-flex items-center gap-1 text-xs font-medium text-fg underline decoration-accent underline-offset-2"
          >
            Open the library
            <ArrowRight size={12} aria-hidden />
          </Link>
        </Cell>
        <Cell label="Language model" icon={<Cpu size={14} aria-hidden />}>
          <StatusBadge
            status={modelStateStatus(status.model, status.database)}
            label={ready ? "Ready" : MODEL_BADGE[status.model.state]}
            size="xs"
            className={ready ? "text-fg!" : ""}
          />
          <p className="text-sm font-medium">{modelStateText(status.model, status.database)}</p>
          {status.model.state !== "not-configured" && (
            <p className="break-all font-mono text-[11px] leading-snug text-muted">{status.model.url}</p>
          )}
        </Cell>
        <Cell label="Database" icon={<Database size={14} aria-hidden />}>
          <StatusBadge
            status={DATABASE_BADGE[status.database].status}
            label={DATABASE_BADGE[status.database].label}
            size="xs"
            className={status.database === "connected" ? "text-fg!" : ""}
          />
          <p className="text-sm font-medium">{databaseText(status.database)}</p>
          {status.database === "connected" && lib.source === "bundled" && (
            <p className="text-xs leading-snug text-muted">Its library is empty (not synced yet): the bundled copy answers.</p>
          )}
        </Cell>
        <Cell label="Retrieval" icon={<Search size={14} aria-hidden />}>
          <p className="text-sm font-medium">{retrievalText(status)}</p>
          {lib.pendingEmbeddings > 0 && (
            <p className="text-xs leading-snug text-muted">
              {lib.pendingEmbeddings} {lib.pendingEmbeddings === 1 ? "passage waits" : "passages wait"} for embedding (full-text
              search covers {lib.pendingEmbeddings === 1 ? "it" : "them"})
            </p>
          )}
        </Cell>
      </div>
    </Card>
  );
}

const chipClass =
  "rounded-[3px] border border-border bg-surface-2 px-2.5 py-1.5 text-left text-[12.5px] leading-snug text-fg transition-colors hover:border-muted/60 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The onboard assistant: status strip, crew-context chips, question form
 * with example questions, and the answers of this browser session.
 */
export function AssistantConsole({
  initialStatus,
  crew,
  link = null,
}: {
  initialStatus: OnboardStatus;
  crew: CrewOption[];
  /** The page's signal delay profile (?link=), kept on links and shown in the ground-link badge. */
  link?: LinkProfileId | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const { state: liveLink } = useGroundLink();
  const linkState = liveLink ?? status.groundLink;

  const [crewId, setCrewId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<{ question: string; crewName: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useSessionAnswers();
  /** The answer that just arrived gets focus (not the ones shown again after navigating back). */
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const askCtrl = useRef<AbortController | null>(null);
  const statusCtrl = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async () => {
    statusCtrl.current?.abort();
    const ctrl = new AbortController();
    statusCtrl.current = ctrl;
    try {
      const res = await fetch("/api/onboard/status", { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) return;
      const next = (await res.json()) as OnboardStatus;
      if (!ctrl.signal.aborted) setStatus(next);
    } catch {
      /* keep the last status */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) void refreshStatus();
    }, STATUS_POLL_MS);
    return () => {
      clearInterval(id);
      statusCtrl.current?.abort();
    };
  }, [refreshStatus]);

  useEffect(() => () => askCtrl.current?.abort(), []);

  const selectedCrew = crew.find((c) => c.id === crewId) ?? null;
  const tooLong = question.trim().length > QUESTION_MAX;

  async function ask(raw: string) {
    if (pending) return;
    const q = raw.trim();
    const problem = questionProblem(q);
    if (problem) {
      setError(problem);
      return;
    }
    const ctrl = new AbortController();
    askCtrl.current = ctrl;
    setError(null);
    setQuestion(q);
    setPending({ question: q, crewName: selectedCrew?.name ?? null });
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, ...(selectedCrew ? { crewId: selectedCrew.id } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const err = await responseError(res);
        setError(`The assistant could not answer: ${err.message}`);
        return;
      }
      const answer = (await res.json()) as AssistantAnswer;
      setFocusKey(addAnswer(q, answer).key);
      setQuestion("");
      void refreshStatus();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(`The assistant could not answer: ${e instanceof Error ? e.message : "network error"}`);
    } finally {
      if (askCtrl.current === ctrl) {
        askCtrl.current = null;
        setPending(null);
      }
    }
  }

  function cancel() {
    askCtrl.current?.abort();
    askCtrl.current = null;
    setPending(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(question);
  }

  function onLinkChanged() {
    void refreshStatus();
  }

  const [latest, ...earlier] = history;

  return (
    <div className="space-y-6">
      <StatusStrip status={status} linkState={linkState} link={link} onLinkChanged={onLinkChanged} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title="Ask the library">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <p id="crew-context-label" className="text-xs text-muted">
                Crew data as context
              </p>
              <div role="group" aria-labelledby="crew-context-label" className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={crewId === null}
                  onClick={() => setCrewId(null)}
                  className={`${tagClass("md", true)} ${crewId === null ? TAG_SELECTED : ""}`}
                >
                  None
                </button>
                {crew.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={crewId === c.id}
                    onClick={() => setCrewId(c.id)}
                    title={c.name}
                    className={`${tagClass("md", true)} font-mono ${crewId === c.id ? TAG_SELECTED : ""}`}
                  >
                    {c.id.toUpperCase()}
                    <span className="sr-only">, {c.name}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs leading-snug text-muted">
                {selectedCrew
                  ? `The assistant reads ${selectedCrew.name}'s status from the rule engine and latest sample, with their data label, and cites them as [C].`
                  : "Pick a crew member to use their own data (status and latest sample) as context. The rule engine and alarms stay primary."}
              </p>
            </div>

            <div>
              <label htmlFor="assistant-question" className="text-xs text-muted">
                Question
              </label>
              <textarea
                id="assistant-question"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                rows={3}
                placeholder="Ask about a procedure, a reference range, a crew baseline or the medical kit"
                aria-describedby="assistant-question-hint"
                aria-invalid={tooLong || undefined}
                className="mt-1.5 block w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-[15px] leading-relaxed text-fg placeholder:text-muted/80 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/40"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p id="assistant-question-hint" className="text-[11px] text-muted">
                  Enter sends, Shift+Enter adds a line.{" "}
                  <span className={`tabular ${tooLong ? "font-semibold text-critical" : ""}`}>
                    {question.trim().length}/{QUESTION_MAX}
                  </span>
                </p>
                <div className="flex gap-2">
                  {pending && (
                    <button
                      type="button"
                      onClick={cancel}
                      className="rounded-lg border border-border px-3 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!!pending}
                    className="inline-flex items-center gap-2 rounded-lg bg-fg px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pending ? <LoaderCircle size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Send size={16} aria-hidden />}
                    {pending ? "Asking…" : "Ask"}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg border border-critical/60 bg-critical/10 px-3 py-2 text-sm text-critical">
                {error}
              </div>
            )}

            <div>
              <p id="examples-label" className="text-xs text-muted">
                Example questions
              </p>
              <div role="group" aria-labelledby="examples-label" className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button key={q} type="button" disabled={!!pending} onClick={() => void ask(q)} className={chipClass}>
                    {q}
                  </button>
                ))}
              </div>
              <p id="outside-label" className="mt-3 text-xs text-muted">
                Not in the library (the assistant says so instead of guessing)
              </p>
              <div role="group" aria-labelledby="outside-label" className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" disabled={!!pending} onClick={() => void ask(OUT_OF_LIBRARY_EXAMPLE)} className={chipClass}>
                  {OUT_OF_LIBRARY_EXAMPLE}
                </button>
              </div>
            </div>
          </form>
        </Card>

        <section aria-labelledby="answers-heading" className="min-w-0 space-y-4">
          <h2 id="answers-heading" className="sr-only">
            Answers
          </h2>
          {/* Stays mounted: screen readers announce the changed text (the answer heading then takes focus). */}
          <p role="status" className="sr-only">
            {pending ? "Searching the onboard library…" : ""}
          </p>
          {pending && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-4 md:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <LoaderCircle size={16} aria-hidden className="animate-spin text-accent motion-reduce:animate-none" />
                Searching the onboard library…
              </p>
              <p className="mt-1 text-sm text-muted">“{pending.question}”{pending.crewName ? ` · ${pending.crewName}` : ""}</p>
              <p className="mt-2 text-xs text-muted">
                With the language model running, an answer can take up to a minute on {hostText(status.database)}. Without it the
                matching passages come back at once.
              </p>
            </div>
          )}
          {latest ? (
            <AnswerCard key={latest.key} entry={latest} focusOnMount={latest.key === focusKey} />
          ) : (
            !pending && (
              <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
                No questions asked yet. The last {HISTORY_MAX} answers of this browser tab appear here, newest first, each with the
                library passages it cites and how fresh the library is. Nothing is stored on the server.
              </div>
            )
          )}
          {earlier.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted">Earlier answers in this browser session</h3>
              <ul className="mt-2 space-y-2">
                {earlier.map((e) => (
                  <li key={e.key}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent group-open:mb-2 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="font-medium">{STATUS_HEADING[e.answer.status]}</span>
                          <span className="text-muted"> · “{e.question}”</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs tabular text-muted">
                          {utcTime(e.answer.askedAt)}
                          <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
                        </span>
                      </summary>
                      <AnswerCard entry={e} />
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
