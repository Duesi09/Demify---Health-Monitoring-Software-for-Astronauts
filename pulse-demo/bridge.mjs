// Bridge: subscribes to demify/crew/+/vitals and forwards each heart-rate
// reading to Demify's device API (POST /api/readings).
// No queues and no retries: a reading that cannot be delivered is dropped,
// the next one follows within a second anyway.
//
//   node bridge.mjs        (reads .env: DEMIFY_URL, DEMIFY_ADMIN_TOKEN, MQTT_URL)

import mqtt from "mqtt";
import { loadEnv, mask, stamp } from "./lib/env.mjs";
import { parseVitalsMessage, demifyErrorHint, TOPIC_FILTER, STATUS_TOPIC } from "./lib/contract.mjs";

const env = loadEnv();
const endpoint = new URL("/api/readings", env.DEMIFY_URL).toString();

let forwarded = 0;
let failed = 0;
let lastError = "";
let inFlight = false;
let pending = null; // newest message that arrived while a POST was in flight

async function postToDemify(readings) {
  const headers = { "Content-Type": "application/json" };
  if (env.DEMIFY_ADMIN_TOKEN) headers["x-demify-admin"] = env.DEMIFY_ADMIN_TOKEN;
  // Node's fetch sends no Origin header, which Demify requires for device writes.
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(readings),
    signal: AbortSignal.timeout(5000),
  });
  let detail = "";
  if (res.status !== 201) {
    try {
      detail = (await res.json())?.error ?? "";
    } catch {
      /* not JSON */
    }
  } else {
    await res.body?.cancel().catch(() => {});
  }
  return { status: res.status, detail };
}

async function forward(readings) {
  if (inFlight) {
    pending = readings; // keep only the newest
    return;
  }
  inFlight = true;
  try {
    for (let batch = readings; batch; batch = pending, pending = null) {
      const summary = batch.map((r) => `${r.crewId} ${r.value} bpm`).join(", ");
      try {
        const { status, detail } = await postToDemify(batch);
        if (status === 201) {
          forwarded += batch.length;
          if (lastError) console.log(`${stamp()} Demify reachable again`);
          lastError = "";
          console.log(`${stamp()} -> Demify 201  ${summary}`);
        } else {
          failed += batch.length;
          const msg = `${status} ${detail}`.trim();
          if (msg !== lastError) console.warn(`${stamp()} -> Demify ${msg}  hint: ${demifyErrorHint(status)}`);
          lastError = msg;
        }
      } catch (err) {
        failed += batch.length;
        const code = err?.cause?.code ?? err?.name ?? "error";
        const msg = `${code}`;
        if (msg !== lastError) console.warn(`${stamp()} -> Demify unreachable (${code})  hint: ${demifyErrorHint(code)}`);
        lastError = msg;
      }
    }
  } finally {
    inFlight = false;
  }
}

const client = mqtt.connect(env.MQTT_URL, {
  clientId: `demify-bridge-${process.pid}`,
  reconnectPeriod: 2000,
  connectTimeout: 5000,
});
let brokerUp = false;
client.on("connect", () => {
  brokerUp = true;
  console.log(`${stamp()} MQTT connected to ${env.MQTT_URL}, subscribing ${TOPIC_FILTER}`);
  client.subscribe([TOPIC_FILTER, STATUS_TOPIC], { qos: 0 }, (err) => {
    if (err) console.warn(`${stamp()} subscribe failed: ${err.message}`);
  });
});
client.on("close", () => {
  if (brokerUp) console.warn(`${stamp()} MQTT broker down (will reconnect)`);
  brokerUp = false;
});
client.on("error", (err) => {
  if (err?.code !== "ECONNREFUSED") console.warn(`${stamp()} MQTT error: ${err.message}`);
});
client.on("message", (topic, payload) => {
  try {
    if (topic === STATUS_TOPIC) {
      console.log(`${stamp()} phone gateway status: ${String(payload).slice(0, 20)}`);
      return;
    }
    const m = parseVitalsMessage(topic, payload);
    if (!m.ok) {
      console.warn(`${stamp()} ignored message on ${topic.slice(0, 60)}: ${m.error}`);
      return;
    }
    if (m.dropped) console.warn(`${stamp()} dropped ${m.dropped} reading(s) older than 10 s`);
    if (m.readings.length) void forward(m.readings);
  } catch (err) {
    console.warn(`${stamp()} message error: ${err.message}`);
  }
});

console.log(`${stamp()} bridge -> ${endpoint}  admin token: ${mask(env.DEMIFY_ADMIN_TOKEN)}`);
let seenForwarded = 0;
let seenFailed = 0;
setInterval(() => {
  const f = forwarded - seenForwarded;
  const x = failed - seenFailed;
  seenForwarded = forwarded;
  seenFailed = failed;
  console.log(`${stamp()} last 10 s: ${f} reading(s) forwarded${x ? `, ${x} failed` : ""} (total ${forwarded})`);
}, 10_000);

function shutdown() {
  client.end(true);
  setTimeout(() => process.exit(0), 200).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
