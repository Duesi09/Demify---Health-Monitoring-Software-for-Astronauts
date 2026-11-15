// The message contracts of the pulse demo, as pure functions (no I/O), so
// the gateway, the bridge and the tests share one definition.
//
//   phone --POST /api/pulse--> gateway --MQTT demify/crew/<id>/vitals--> bridge --POST /api/readings--> Demify
//
// Demify contract (src/app/api/readings/route.ts, src/lib/health/knowledge.ts):
// a JSON array of {crewId, indicator, value, unit, takenAt?, source, note?};
// heartRate inputRange [25, 220] bpm; source "sensor" drives the live monitor.

import { createHash, timingSafeEqual } from "node:crypto";

/** Demify's heartRate inputRange, narrowed to what a camera estimate can plausibly give. */
export const DEMIFY_HR_RANGE = [25, 220];
export const BPM_MIN = Math.max(30, DEMIFY_HR_RANGE[0]);
export const BPM_MAX = Math.min(220, DEMIFY_HR_RANGE[1]);
export const CREW_ID_RE = /^[a-z0-9-]{1,32}$/;
export const TOPIC_PREFIX = "demify/crew/";
export const TOPIC_FILTER = "demify/crew/+/vitals";
export const STATUS_TOPIC = "demify/devices/phone-camera/status";
export const MAX_PULSE_BODY = 2048;
export const MAX_READING_AGE_MS = 10_000;
export const MAX_FUTURE_MS = 60_000;

export function topicFor(crewId) {
  return `${TOPIC_PREFIX}${crewId}/vitals`;
}

/** Crew id from a topic "demify/crew/<id>/vitals", or null. */
export function crewFromTopic(topic) {
  const m = /^demify\/crew\/([^/]+)\/vitals$/.exec(String(topic));
  return m && CREW_ID_RE.test(m[1]) ? m[1] : null;
}

/** Constant-time token comparison (hash first so lengths do not leak). */
export function tokenMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Validates the phone's POST /api/pulse body (already JSON-parsed).
 * Returns {ok:true, kind:"reading", crewId, bpm, quality, fps}
 *      or {ok:true, kind:"heartbeat", crewId, fingerOn}   (no bpm: phone alive, nothing to publish)
 *      or {ok:false, error}.
 */
export function validatePulse(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const { crewId } = body;
  if (typeof crewId !== "string" || !CREW_ID_RE.test(crewId)) {
    return { ok: false, error: "crewId must be 1-32 characters a-z, 0-9 or -" };
  }
  if (body.bpm === undefined) {
    return { ok: true, kind: "heartbeat", crewId, fingerOn: body.fingerOn === true };
  }
  const { bpm, quality } = body;
  if (!Number.isInteger(bpm) || bpm < BPM_MIN || bpm > BPM_MAX) {
    return { ok: false, error: `bpm must be a whole number from ${BPM_MIN} to ${BPM_MAX}` };
  }
  if (typeof quality !== "number" || !Number.isFinite(quality) || quality < 0 || quality > 1) {
    return { ok: false, error: "quality must be a number from 0 to 1" };
  }
  let fps = null;
  if (body.fps !== undefined) {
    if (typeof body.fps !== "number" || !Number.isFinite(body.fps) || body.fps < 0 || body.fps > 240) {
      return { ok: false, error: "fps must be a number from 0 to 240" };
    }
    fps = Math.round(body.fps);
  }
  return { ok: true, kind: "reading", crewId, bpm, quality, fps };
}

/** The Demify reading array the gateway publishes. takenAt is always the laptop clock. */
export function buildReadings({ crewId, bpm, quality }, now = new Date()) {
  return [
    {
      crewId,
      indicator: "heartRate",
      value: bpm,
      unit: "bpm",
      takenAt: now.toISOString(),
      source: "sensor",
      note: `phone camera PPG, quality ${quality.toFixed(2)}`,
    },
  ];
}

/**
 * Bridge side: parses and checks one MQTT message for Demify.
 * Returns {ok:true, readings, restamped, dropped} or {ok:false, error}.
 * - only heartRate readings in range, unit bpm, crewId matching the topic
 * - takenAt missing, invalid or more than 60 s in the future: re-stamped now
 * - older than 10 s: dropped (no backlog is ever forwarded)
 */
export function parseVitalsMessage(topic, payload, nowMs = Date.now()) {
  const topicCrew = crewFromTopic(topic);
  if (!topicCrew) return { ok: false, error: `unexpected topic ${String(topic).slice(0, 80)}` };
  let data;
  try {
    data = JSON.parse(String(payload));
  } catch {
    return { ok: false, error: "payload is not JSON" };
  }
  if (!Array.isArray(data) || data.length === 0 || data.length > 50) {
    return { ok: false, error: "payload must be a non-empty array of readings (max 50)" };
  }
  const readings = [];
  let restamped = 0;
  let dropped = 0;
  for (const r of data) {
    if (r === null || typeof r !== "object") return { ok: false, error: "reading is not an object" };
    if (r.indicator !== "heartRate") return { ok: false, error: `indicator must be heartRate, got ${String(r.indicator).slice(0, 30)}` };
    if (r.crewId !== topicCrew) return { ok: false, error: "crewId does not match the topic" };
    if (!Number.isInteger(r.value) || r.value < BPM_MIN || r.value > BPM_MAX) {
      return { ok: false, error: `value must be a whole number from ${BPM_MIN} to ${BPM_MAX}` };
    }
    if (r.unit !== "bpm") return { ok: false, error: 'unit must be "bpm"' };
    let t = typeof r.takenAt === "string" ? Date.parse(r.takenAt) : NaN;
    if (!Number.isFinite(t) || t - nowMs > MAX_FUTURE_MS) {
      t = nowMs;
      restamped++;
    } else if (nowMs - t > MAX_READING_AGE_MS) {
      dropped++;
      continue;
    }
    readings.push({
      crewId: r.crewId,
      indicator: "heartRate",
      value: r.value,
      unit: "bpm",
      takenAt: new Date(Math.min(t, nowMs)).toISOString(),
      source: "sensor",
      ...(typeof r.note === "string" ? { note: r.note.slice(0, 500) } : {}),
    });
  }
  return { ok: true, readings, restamped, dropped };
}

/** Plain-English hint for a failed POST to Demify. */
export function demifyErrorHint(statusOrCode) {
  switch (statusOrCode) {
    case 400:
      return "Demify rejected the reading (bad value, unit or crew id)";
    case 401:
      return "wrong or missing DEMIFY_ADMIN_TOKEN";
    case 403:
      return "request has an Origin header (cross-origin requests are refused)";
    case 413:
      return "request too large";
    case 415:
      return "Content-Type must be application/json";
    case 429:
      return "rate limited by Demify: slow down";
    case "ECONNREFUSED":
      return "is Demify running at DEMIFY_URL?";
    case "ENOTFOUND":
      return "DEMIFY_URL host name not found";
    case "TimeoutError":
    case "ETIMEDOUT":
      return "Demify did not answer in time";
    default:
      return typeof statusOrCode === "number" && statusOrCode >= 500 ? "Demify server error: check its terminal" : "unexpected error";
  }
}

/** Is this IPv4 a typical hotspot / LAN address (where the phone will be)? */
export function isLanAddress(ip) {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}
