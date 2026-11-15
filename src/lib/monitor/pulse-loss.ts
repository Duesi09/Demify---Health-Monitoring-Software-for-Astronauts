/**
 * Pulse loss on the phone pulse demo (training): the sensor-only test crew
 * member had a pulse measured for at least PULSE_LOSS_MIN_MEASURED_S seconds
 * in a row, then the readings stopped. The monitor then raises the high-
 * priority training alarm "NO PULSE (phone signal lost)" and the cardiac
 * arrest checklist opens, so the crew rehearses the first check (responsive?
 * breathing? pulse?). In practice a lost camera signal almost always means the
 * finger left the camera; the checklist starts with exactly that check.
 *
 * The alarm ends when readings arrive again (finger back on the camera) or
 * PULSE_LOSS_HOLD_MS after the last reading. Pure functions (unit-tested).
 */

/** Seconds of continuous measurement before a lost signal counts as "pulse lost". */
export const PULSE_LOSS_MIN_MEASURED_S = 10;
/** Readings closer together than this belong to one continuous measurement. */
export const PULSE_EPISODE_GAP_MS = 4_000;
/** How long the alarm stays after the last reading when nothing arrives again. */
export const PULSE_LOSS_HOLD_MS = 5 * 60_000;
/** Monitor alarm text (high priority). */
export const PULSE_LOSS_ALARM_TEXT = "NO PULSE (phone signal lost)";

export interface PulseLoss {
  /** Time of the last reading (ISO). */
  lostAt: string;
  /** Length of the measurement before the loss, seconds. */
  measuredS: number;
  /** Last measured heart rate, bpm. */
  lastHr: number;
}

/**
 * The pulse loss at `now`, or null. `readings` are the crew member's sensor
 * heart-rate readings (any order). `freshMs` is how old the newest reading may
 * be and still count as a live signal (SENSOR_ONLY_FRESH_MS).
 */
export function pulseLoss(
  readings: ReadonlyArray<{ takenAt: string; value: number }>,
  now: number,
  freshMs: number,
): PulseLoss | null {
  const times = readings
    .map((r) => ({ t: Date.parse(r.takenAt), v: r.value }))
    .filter((r) => Number.isFinite(r.t) && r.t <= now)
    .sort((a, b) => a.t - b.t);
  const last = times.at(-1);
  if (!last) return null;
  const silence = now - last.t;
  if (silence <= freshMs || silence > PULSE_LOSS_HOLD_MS) return null;
  // Walk back from the last reading while the gaps stay small: the last continuous measurement.
  let first = last.t;
  for (let i = times.length - 2; i >= 0; i--) {
    if (first - times[i].t > PULSE_EPISODE_GAP_MS) break;
    first = times[i].t;
  }
  const measuredS = (last.t - first) / 1000;
  if (measuredS < PULSE_LOSS_MIN_MEASURED_S) return null;
  return { lostAt: new Date(last.t).toISOString(), measuredS: Math.round(measuredS), lastHr: Math.round(last.v) };
}
