"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Save, Stethoscope } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { StatusIcon } from "@/components/overview/status-icon";
import { bySeverity, formatUtc, formatValue } from "@/components/overview/format";
import { actionUnderLink } from "@/components/crew/protocols";
import { findingUnderLink, linkPolicy, withLink, type LinkProfileId } from "@/lib/link";
import { CHECK_IN_INDICATORS, INDICATORS, classify, evaluateValue } from "@/lib/health/knowledge";
import type { IndicatorId, Status } from "@/lib/types";
import { CHECK_IN_GROUPS, SCALE_LABELS, type CheckInInput, type CheckInResult } from "./types";

type Values = Partial<Record<IndicatorId, string>>;

interface Live {
  state: "empty" | "invalid" | "ok";
  /** Rounded to the indicator's precision: the value that is sent and stored. */
  value?: number;
  /** True when rounding changed what was typed. */
  rounded?: boolean;
  status?: Status;
  escalate?: boolean;
  baselineShift?: boolean;
  /** Persistence rule this value counts toward (repeated values escalate). */
  repeatRule?: string | null;
}

/** Same evaluation as the server action (evaluateValue), so preview and saved result agree. */
function evaluate(id: IndicatorId, raw: string | undefined, baseline?: number): Live {
  if (raw == null || raw.trim() === "") return { state: "empty" };
  const typed = Number(raw);
  const [lo, hi] = INDICATORS[id].inputRange;
  if (!Number.isFinite(typed) || typed < lo || typed > hi) return { state: "invalid" };
  const ev = evaluateValue(id, typed, baseline);
  return {
    state: "ok",
    value: ev.value,
    rounded: ev.value !== typed,
    status: ev.status,
    escalate: ev.escalate,
    baselineShift: ev.baselineShift,
    repeatRule: ev.repeatRule,
  };
}

/**
 * Live status line under each field: status badge + the matching range text.
 * Escalation wording matches the legend ("Escalation only when Demify shows
 * contact the flight surgeon"), framed as training; in a blackout there is
 * no one to call, so it points to the onboard procedures.
 */
function Feedback({
  id,
  live,
  serverError,
  blackout,
}: {
  id: IndicatorId;
  live: Live;
  serverError?: string;
  /** No contact with the ground (linkPolicy mode "blackout"). */
  blackout: boolean;
}) {
  const def = INDICATORS[id];
  if (serverError) {
    return <p className="text-xs text-critical">{serverError}</p>;
  }
  if (live.state === "empty") {
    return <p className="text-xs text-muted">Normal: {def.ranges.nominal}</p>;
  }
  if (live.state === "invalid") {
    return (
      <p className="text-xs text-critical">
        Enter a number from {def.inputRange[0]} to {def.inputRange[1]} {def.unit}.
      </p>
    );
  }
  const s = live.status!;
  const rangeText = live.baselineShift
    ? `Large change (≥ 25 %) from your pre-flight baseline; population normal: ${def.ranges.nominal}`
    : s === "nominal"
      ? `Normal: ${def.ranges.nominal}`
      : s === "caution"
        ? `Caution range: ${def.ranges.caution}`
        : `Critical range: ${def.ranges.critical}`;
  return (
    <div className="space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge status={s} />
        <span className={s === "nominal" ? "text-muted" : "text-fg/90"}>{rangeText}</span>
      </p>
      {live.rounded && (
        <p className="text-muted">
          Saved as {live.value!.toFixed(def.decimals)} {def.unit}.
        </p>
      )}
      {live.escalate ? (
        <p className="font-medium text-critical">
          {blackout
            ? "Escalation rule met: after saving, Demify shows it with no contact (blackout). Training: in a real mission this prompts the onboard procedures; transmit when contact returns."
            : "Escalation rule met: after saving, Demify shows “contact the flight surgeon”. Training: in a real mission this prompts a call to the flight surgeon."}
        </p>
      ) : live.repeatRule ? (
        <p className="text-fg/90">Single value; repeated values escalate: {live.repeatRule}.</p>
      ) : (
        s === "critical" && <p className="text-fg/90">No escalation rule met: re-check and log.</p>
      )}
    </div>
  );
}

function NumberField({
  id,
  value,
  onChange,
  baseline,
  serverError,
  blackout,
}: {
  id: IndicatorId;
  value: string;
  onChange: (v: string) => void;
  baseline?: number;
  serverError?: string;
  blackout: boolean;
}) {
  const def = INDICATORS[id];
  const live = evaluate(id, value, baseline);
  const inputId = `ci-${id}`;
  const fbId = `ci-${id}-fb`;
  const baseId = `ci-${id}-base`;
  const border =
    live.state === "invalid" || serverError
      ? "border-critical"
      : live.status === "critical"
        ? "border-critical/70"
        : live.status === "caution"
          ? "border-caution/70"
          : "border-border";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {def.label}
        </label>
        {baseline != null && (
          <span id={baseId} className="text-xs text-muted tabular">
            pre-flight {baseline} {def.unit}
          </span>
        )}
      </div>
      <div className={`mt-1 flex items-center rounded-lg border bg-surface-2 focus-within:ring-2 focus-within:ring-accent/60 ${border}`}>
        <input
          id={inputId}
          name={id}
          type="number"
          inputMode={def.inputRange[0] < 0 ? undefined : "decimal"}
          min={def.inputRange[0]}
          max={def.inputRange[1]}
          step={def.decimals ? 1 / 10 ** def.decimals : 1}
          value={value}
          placeholder={baseline != null ? `pre-flight ${baseline}` : undefined}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={baseline != null ? `${baseId} ${fbId}` : fbId}
          aria-invalid={live.state === "invalid" || !!serverError || undefined}
          className="w-full min-w-0 rounded-lg bg-transparent px-3 py-2 text-base tabular outline-none placeholder:text-sm placeholder:text-muted"
        />
        <span className="shrink-0 pr-3 text-sm text-muted">{def.unit}</span>
      </div>
      <div id={fbId} className="mt-1.5 min-h-5">
        <Feedback id={id} live={live} serverError={serverError} blackout={blackout} />
      </div>
    </div>
  );
}

function ScaleField({
  id,
  value,
  onChange,
  serverError,
  blackout,
}: {
  id: IndicatorId;
  value: string;
  onChange: (v: string) => void;
  serverError?: string;
  blackout: boolean;
}) {
  const def = INDICATORS[id];
  const [lo, hi] = def.inputRange;
  const options = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const labels = SCALE_LABELS[id] ?? {};
  const live = evaluate(id, value);
  const fbId = `ci-${id}-fb`;
  return (
    <fieldset className="min-w-0 sm:col-span-2" aria-describedby={fbId}>
      <legend className="flex w-full flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
        <span>{def.label}</span>
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs font-normal text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:underline"
          >
            Clear
          </button>
        )}
      </legend>
      <div
        className="mt-1 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((n) => {
          const s = classify(id, n);
          const checked = value === String(n);
          // Selected: inverted like a segmented control; caution/critical use the solid alarm fills of StatusBadge.
          const tone = !checked
            ? "border-border bg-surface-2 text-fg hover:border-muted/60"
            : s === "nominal"
              ? "border-fg bg-fg text-bg"
              : s === "caution"
                ? "border-caution-fill bg-caution-fill text-on-caution"
                : "border-critical-fill bg-critical-fill text-on-critical";
          return (
            <label key={n} className="relative cursor-pointer">
              <input
                type="radio"
                name={id}
                value={n}
                checked={checked}
                onChange={() => onChange(String(n))}
                className="peer sr-only"
                aria-label={`${n}${labels[n] ? ` (${labels[n]})` : ""}`}
              />
              <span
                className={`flex h-10 items-center justify-center rounded-[3px] border text-sm font-semibold tabular transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${tone}`}
                aria-hidden
              >
                {n}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>
          {lo} {labels[lo] ?? ""}
        </span>
        <span>
          {hi} {labels[hi] ?? ""}
        </span>
      </div>
      <div id={fbId} className="mt-1.5 min-h-5">
        <Feedback id={id} live={live} serverError={serverError} blackout={blackout} />
      </div>
    </fieldset>
  );
}

const isScale = (id: IndicatorId) => id in SCALE_LABELS;

export function CheckInForm({
  crewId,
  crewName,
  commDelaySeconds,
  link = null,
  baselines,
  submit,
}: {
  crewId: string;
  crewName: string;
  /** One-way signal delay in seconds (from the server, ?link= aware); null means no contact (blackout). */
  commDelaySeconds: number | null;
  /** Signal-delay profile chosen with ?link=, carried into the result links (null: none chosen). */
  link?: LinkProfileId | null;
  baselines: Partial<Record<IndicatorId, number>>;
  submit: (input: CheckInInput) => Promise<CheckInResult>;
}) {
  const [values, setValues] = useState<Values>({});
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const set = (id: IndicatorId) => (v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  const lives = CHECK_IN_INDICATORS.map((id) => [id, evaluate(id, values[id], baselines[id])] as const);
  const entered = lives.filter(([, l]) => l.state === "ok");
  const invalid = lives.filter(([, l]) => l.state === "invalid");
  const counts = {
    caution: entered.filter(([, l]) => l.status === "caution").length,
    critical: entered.filter(([, l]) => l.status === "critical").length,
  };
  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const blackout = linkPolicy(commDelaySeconds).mode === "blackout";

  const grouped = new Set(CHECK_IN_GROUPS.flatMap((g) => g.indicators));
  const groups = [
    ...CHECK_IN_GROUPS.map((g) => ({ ...g, indicators: g.indicators.filter((i) => CHECK_IN_INDICATORS.includes(i)) })),
    {
      id: "other",
      title: "Other",
      description: "",
      indicators: CHECK_IN_INDICATORS.filter((i) => !grouped.has(i)),
    },
  ].filter((g) => g.indicators.length);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!entered.length || invalid.length) return;
    const payload: CheckInInput = {
      crewId,
      values: Object.fromEntries(entered.map(([id, l]) => [id, l.value!])),
      note: note.trim() || undefined,
    };
    startTransition(async () => {
      try {
        const res = await submit(payload);
        setResult(res);
        if (res.ok) {
          setValues({});
          setNote("");
        }
      } catch {
        setResult({ ok: false, error: "Could not reach the Demify server. Your values are still in the form; try again." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {result && <ResultPanel result={result} headingRef={resultRef} commDelaySeconds={commDelaySeconds} crewId={crewId} link={link} />}

      <form onSubmit={onSubmit} noValidate aria-label={`Daily check-in for ${crewName}`} className="space-y-6">
        {groups.map((g) => (
          <fieldset key={g.id} className="rounded-xl border border-border bg-surface p-4 md:p-6">
            <legend className="sr-only">{g.title}</legend>
            <h2 className="text-base font-semibold tracking-tight">
              {g.title}
            </h2>
            {g.description && <p className="mt-0.5 text-xs text-muted">{g.description}</p>}
            <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {g.indicators.map((id) =>
                isScale(id) ? (
                  <ScaleField
                    key={id}
                    id={id}
                    value={values[id] ?? ""}
                    onChange={set(id)}
                    serverError={fieldErrors[id]}
                    blackout={blackout}
                  />
                ) : (
                  <NumberField
                    key={id}
                    id={id}
                    value={values[id] ?? ""}
                    onChange={set(id)}
                    serverError={fieldErrors[id]}
                    baseline={baselines[id]}
                    blackout={blackout}
                  />
                ),
              )}
            </div>
          </fieldset>
        ))}

        <div className="rounded-xl border border-border bg-surface p-4 md:p-6">
          <label htmlFor="ci-note" className="block text-base font-semibold tracking-tight">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <p id="ci-note-hint" className="mt-0.5 text-xs text-muted">
            Symptoms, context (after EVA, poor sleep, medication taken) or anything the flight surgeon should know.
          </p>
          <textarea
            id="ci-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            aria-describedby="ci-note-hint"
            className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/60"
          />
          <p className="text-right text-[11px] text-muted tabular">{note.length}/500</p>
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:mx-0 md:rounded-xl md:border md:px-5">
          <p className="text-sm" aria-live="polite">
            {entered.length ? (
              <>
                <span className="font-medium">{entered.length}</span> value{entered.length === 1 ? "" : "s"} entered
                {counts.caution > 0 && <StatusBadge status="caution" size="xs" label={`${counts.caution} caution`} className="ml-2 align-[1px]" />}
                {counts.critical > 0 && <StatusBadge status="critical" size="xs" label={`${counts.critical} critical`} className="ml-1.5 align-[1px]" />}
                {invalid.length > 0 && <span className="text-critical"> · {invalid.length} out of range</span>}
              </>
            ) : (
              <span className="text-muted">All fields are optional. Enter what you measured today.</span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValues({});
                setNote("");
              }}
              disabled={pending || (!Object.values(values).some(Boolean) && !note)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={pending || !entered.length || invalid.length > 0}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              <Save size={16} aria-hidden />
              {pending ? "Saving…" : "Save check-in"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/** The saved check-in: findings and crew actions under the current link (exported for tests). */
export function ResultPanel({
  result,
  headingRef,
  commDelaySeconds,
  crewId,
  link,
}: {
  result: CheckInResult;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  commDelaySeconds: number | null;
  crewId: string;
  link: LinkProfileId | null;
}) {
  if (!result.ok) {
    return (
      <section role="alert" className="rounded-xl border border-critical/60 bg-critical/10 p-4">
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-critical outline-none">
          Check-in not saved
        </h2>
        <p className="mt-1 text-sm">{result.error}</p>
      </section>
    );
  }
  const items = [...result.items].sort(bySeverity);
  // Only a met escalation rule asks for the flight surgeon; a critical band alone does not.
  const escalate = items.filter((i) => i.escalate);
  const policy = linkPolicy(commDelaySeconds);
  return (
    <section aria-labelledby="ci-result" className="space-y-4 rounded-xl border border-fg/25 bg-surface p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ci-result" ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
            Check-in saved for {result.crewName}
          </h2>
          <p className="text-xs text-muted">
            {result.items.length} value{result.items.length === 1 ? "" : "s"} stored as crew entries · {formatUtc(result.takenAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          Overall status now <StatusBadge status={result.overall} />
        </div>
      </div>

      {(escalate.length > 0 || result.otherEscalations.length > 0) && (
        <div role="alert" className="rounded-lg border border-critical/60 bg-critical/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-critical">
            <Stethoscope size={18} aria-hidden />{" "}
            {policy.mode === "blackout" ? "Escalation rule met: no contact (blackout)" : "Contact the flight surgeon"}
          </p>
          <p className="mt-1 text-sm">
            {policy.mode === "blackout"
              ? "No contact with the ground: act on the onboard procedures; transmit when contact returns. Start the crew actions below now and keep this check-in and your notes for the report."
              : policy.mode === "delayed"
                ? `Signal delay is ${policy.label} one way: start the crew actions below now, then send this check-in and your notes to the ground. Do not wait for a reply.`
                : `Request a private medical conference now (signal delay ${policy.label}). Start the crew actions below while you connect.`}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {escalate.map((i) => (
              <li key={i.indicator}>
                {findingUnderLink(i.finding, policy.mode)}{" "}
                <span className="text-muted">Escalate when: {INDICATORS[i.indicator].escalation}</span>
              </li>
            ))}
            {result.otherEscalations.map((e) => (
              <li key={e.indicator}>
                {findingUnderLink(e.finding, policy.mode)} <span className="text-muted">(from earlier data)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.indicator} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <StatusIcon status={i.status} />
                {INDICATORS[i.indicator].short}
                <span className="tabular text-muted">{formatValue(i.indicator, i.value)}</span>
              </p>
              <StatusBadge status={i.status} />
            </div>
            <p className="mt-1 text-sm text-muted">{findingUnderLink(i.finding, policy.mode)}</p>
            {i.actions.length > 0 && (
              <div className="mt-2">
                <h3 className="text-[11px] text-muted">What to do now</h3>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
                  {/* Same blackout wording as the crew page, the body map and the guidance (actionUnderLink). */}
                  {i.actions.map((a) => (
                    <li key={a}>{actionUnderLink(a, policy.mode)}</li>
                  ))}
                </ol>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={withLink(`/?crew=${crewId}#detail`, link)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
          View on overview
        </Link>
        <Link href={withLink(`/body?crew=${crewId}`, link)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
          Open body map
        </Link>
      </div>
    </section>
  );
}
