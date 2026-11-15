// Gateway: serves the phone page over HTTPS and publishes the phone's pulse
// estimates to MQTT (demify/crew/<id>/vitals) as Demify reading arrays.
// Camera pulse estimate for a demo, not a medical measurement.
//
//   node gateway.mjs        (reads .env: PORT, PULSE_TOKEN, MQTT_URL, CREW_ID, HTTP_PORT)

import https from "node:https";
import http from "node:http";
import os from "node:os";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import mqtt from "mqtt";
import selfsigned from "selfsigned";
import QRCode from "qrcode";
import { loadEnv, mask, stamp, ROOT } from "./lib/env.mjs";
import {
  validatePulse,
  buildReadings,
  topicFor,
  tokenMatches,
  isLanAddress,
  STATUS_TOPIC,
  MAX_PULSE_BODY,
} from "./lib/contract.mjs";

const env = loadEnv();
const PUBLIC_DIR = join(ROOT, "public");
const CERT_DIR = join(ROOT, "certs");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", // the page URL carries the token
  "Permissions-Policy": "camera=(self)",
};
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'";

/* --------------------------------------------------------------------------- */
/* Certificate: self-signed, SAN = localhost, 127.0.0.1 and every local IPv4    */
/* --------------------------------------------------------------------------- */

/** Every IPv4 of this laptop, with the adapter name. */
function localInterfaces() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" || a.family === 4) out.push({ ip: a.address, name });
  }
  return out;
}

function localIPv4() {
  return [...new Set(["127.0.0.1", ...localInterfaces().map((i) => i.ip)])].sort();
}

/** Virtual adapters (WSL, Hyper-V, VMware, VirtualBox, VPNs) are never the phone's network. */
function isVirtualAdapter(name) {
  return /vEthernet|WSL|Hyper-V|VMware|VirtualBox|VMnet|Loopback|Tailscale|ZeroTier|Docker|Npcap/i.test(name);
}

async function ensureCert() {
  const ips = localIPv4();
  const keyFile = join(CERT_DIR, "key.pem");
  const certFile = join(CERT_DIR, "cert.pem");
  const metaFile = join(CERT_DIR, "meta.json");
  try {
    const meta = JSON.parse(await readFile(metaFile, "utf8"));
    const sameIps = JSON.stringify(meta.ips) === JSON.stringify(ips);
    const fresh = Date.parse(meta.notAfter) - Date.now() > 2 * 86_400_000;
    if (sameIps && fresh && existsSync(keyFile) && existsSync(certFile)) {
      return { key: await readFile(keyFile), cert: await readFile(certFile), ips, regenerated: false };
    }
  } catch {
    /* no or unreadable meta: generate */
  }
  const notBefore = new Date(Date.now() - 60_000);
  const notAfter = new Date(notBefore.getTime() + 30 * 86_400_000);
  const pems = await selfsigned.generate([{ name: "commonName", value: "Demify pulse gateway (demo)" }], {
    keyType: "rsa",
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    extensions: [
      { name: "basicConstraints", cA: false, critical: true },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [{ type: 2, value: "localhost" }, ...ips.map((ip) => ({ type: 7, ip }))],
      },
    ],
  });
  await mkdir(CERT_DIR, { recursive: true });
  await writeFile(keyFile, pems.private, { mode: 0o600 });
  await writeFile(certFile, pems.cert);
  await writeFile(metaFile, JSON.stringify({ ips, notAfter: notAfter.toISOString(), fingerprint: pems.fingerprint }, null, 2));
  return { key: pems.private, cert: pems.cert, ips, regenerated: true };
}

/* --------------------------------------------------------------------------- */
/* MQTT                                                                         */
/* --------------------------------------------------------------------------- */

let brokerUp = false;
const client = mqtt.connect(env.MQTT_URL, {
  clientId: `demify-gateway-${process.pid}`,
  reconnectPeriod: 2000,
  connectTimeout: 5000,
  will: { topic: STATUS_TOPIC, payload: "offline", qos: 0, retain: true },
});
client.on("connect", () => {
  brokerUp = true;
  console.log(`${stamp()} MQTT connected to ${env.MQTT_URL}`);
  client.publish(STATUS_TOPIC, "online", { qos: 0, retain: true });
});
client.on("reconnect", () => {
  if (brokerUp) console.warn(`${stamp()} MQTT reconnecting...`);
});
client.on("close", () => {
  if (brokerUp) console.warn(`${stamp()} MQTT broker down (still serving the page; will reconnect)`);
  brokerUp = false;
});
client.on("error", (err) => {
  // ECONNREFUSED while the broker is down: logged once via "close", keep quiet here.
  if (err?.code !== "ECONNREFUSED") console.warn(`${stamp()} MQTT error: ${err.message}`);
});

/* --------------------------------------------------------------------------- */
/* HTTP handling                                                                */
/* --------------------------------------------------------------------------- */

const lastPublish = new Map(); // crewId -> ms
const phone = { lastSeen: 0, fingerOn: null };

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string";
  res.writeHead(status, {
    ...BASE_HEADERS,
    "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function forbiddenPage(res) {
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Token needed</title><body style="font:18px/1.5 system-ui,sans-serif;padding:24px;background:#f4f6fb;color:#0f1729">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d5dde9;border-radius:12px;padding:18px 20px">
<h1 style="margin:0 0 8px;font-size:24px">Token needed</h1><p style="margin:0;color:#55627a">Open the full link from the laptop: the line with <b>&gt;&gt;</b>
in the demo window. It contains <code>?token=…</code>.</p></div></body>`;
  res.writeHead(403, { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function readBody(req, max) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handlePulse(req, res) {
  if (env.PULSE_TOKEN && !tokenMatches(req.headers["x-pulse-token"], env.PULSE_TOKEN)) {
    return send(res, 401, { ok: false, error: "wrong or missing pulse token: reopen the link from the laptop" });
  }
  const ctype = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (ctype !== "application/json") return send(res, 415, { ok: false, error: "Content-Type must be application/json" });
  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_PULSE_BODY));
  } catch (err) {
    if (err.status === 413) return send(res, 413, { ok: false, error: "body too large (max 2 KB)" });
    return send(res, 400, { ok: false, error: "invalid JSON" });
  }
  const v = validatePulse(body);
  if (!v.ok) return send(res, 400, { ok: false, error: v.error });

  const now = Date.now();
  const wasSeen = now - phone.lastSeen < 10_000;
  phone.lastSeen = now;
  if (v.kind === "heartbeat") {
    const state = v.fingerOn ? "finger on, locking on" : "no finger";
    if (phone.state !== state || !wasSeen) console.log(`${stamp()} phone connected (${v.crewId}): ${state}`);
    phone.state = state;
    return send(res, 200, { ok: true, published: false, broker: brokerUp ? "up" : "down" });
  }
  phone.state = "measuring";
  if (now - (lastPublish.get(v.crewId) ?? 0) < 900) {
    return send(res, 200, { ok: true, published: false, reason: "throttled (max 1 per second)" });
  }
  if (!brokerUp) {
    console.warn(`${stamp()} ${v.crewId} ${v.bpm} bpm NOT published: broker down`);
    return send(res, 503, { ok: false, error: "broker down" });
  }
  const readings = buildReadings(v, new Date(now));
  lastPublish.set(v.crewId, now);
  client.publish(topicFor(v.crewId), JSON.stringify(readings), { qos: 0 }, (err) => {
    if (err) console.warn(`${stamp()} publish failed: ${err.message}`);
  });
  console.log(
    `${stamp()} ${v.crewId.padEnd(4)} ${String(v.bpm).padStart(3)} bpm  quality ${v.quality.toFixed(2)}${v.fps ? `  ${v.fps} fps` : ""}`,
  );
  return send(res, 200, { ok: true, published: true });
}

async function handleStatic(req, res, url) {
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "bad path");
  }
  if (path === "/" || path === "") path = "/index.html";
  const file = resolve(PUBLIC_DIR, "." + path);
  if (!file.startsWith(PUBLIC_DIR + sep)) return send(res, 403, "forbidden");
  if (file.endsWith(".html") && env.PULSE_TOKEN && !tokenMatches(url.searchParams.get("token") ?? "", env.PULSE_TOKEN)) {
    return forbiddenPage(res);
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) return send(res, 404, "not found");
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const headers = { ...BASE_HEADERS, "Content-Type": type, "Content-Length": s.size };
    if (type.startsWith("text/html")) headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    res.end(await readFile(file));
  } catch {
    send(res, 404, "not found");
  }
}

async function handler(req, res) {
  try {
    const url = new URL(req.url ?? "/", "https://gateway.local");
    if (url.pathname === "/api/pulse") {
      if (req.method !== "POST") return send(res, 405, { ok: false, error: "use POST" }, { Allow: "POST" });
      return await handlePulse(req, res);
    }
    if (url.pathname === "/api/status") {
      return send(res, 200, { ok: true, broker: brokerUp ? "up" : "down", phoneSeenSecondsAgo: phone.lastSeen ? Math.round((Date.now() - phone.lastSeen) / 1000) : null });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed", { Allow: "GET, HEAD" });
    return await handleStatic(req, res, url);
  } catch (err) {
    console.warn(`${stamp()} request error: ${err.message}`);
    if (!res.headersSent) send(res, 500, { ok: false, error: "gateway error" });
  }
}

/* --------------------------------------------------------------------------- */
/* Start                                                                        */
/* --------------------------------------------------------------------------- */

let tls = await ensureCert();
const server = https.createServer({ key: tls.key, cert: tls.cert }, handler);
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.on("error", (err) => {
  console.error(`${stamp()} HTTPS server error: ${err.code === "EADDRINUSE" ? `port ${env.PORT} is already in use (another gateway running?)` : err.message}`);
  process.exit(1);
});

/** Prints every link the phone can use (the hotspot one marked with >>). */
function printLinks(heading) {
  const token = env.PULSE_TOKEN ? `token=${env.PULSE_TOKEN}&` : "";
  const out = [
    "",
    "==================================================================",
    heading,
    "==================================================================",
    tls.regenerated ? ` New certificate for: ${tls.ips.join(", ")} (phone must accept the warning again)` : ` Certificate covers: ${tls.ips.join(", ")}`,
    " Open on the phone:",
  ];
  const ifaces = localInterfaces().filter((i) => i.ip !== "127.0.0.1");
  const likely = (i) => isLanAddress(i.ip) && !isVirtualAdapter(i.name);
  ifaces.sort((x, y) => Number(likely(y)) - Number(likely(x)));
  for (const i of ifaces) {
    const url = `https://${i.ip}:${env.PORT}/?${token}crew=${env.CREW_ID}`;
    out.push(`   ${likely(i) ? ">>" : "  "} ${url}   [${i.name}]${likely(i) ? "  <- use this on the hotspot" : ""}`);
  }
  if (!ifaces.some(likely)) out.push("   (no Wi-Fi/LAN address found: is the laptop connected to the phone's hotspot?)");
  out.push(`      https://localhost:${env.PORT}/?${token}crew=${env.CREW_ID}   (this laptop only)`);
  out.push(` MQTT: ${env.MQTT_URL}   pulse token: ${mask(env.PULSE_TOKEN)}`);
  out.push("==================================================================", "");
  console.log(out.join("\n"));
  // QR code of the hotspot link: scan it with the phone camera instead of typing.
  const best = ifaces.find(likely);
  if (best) {
    QRCode.toString(`https://${best.ip}:${env.PORT}/?${token}crew=${env.CREW_ID}`, { type: "terminal", small: true })
      .then((qr) => console.log(` Scan with the phone camera (${best.ip}):\n${qr}`))
      .catch(() => {});
  }
}

server.listen(env.PORT, "0.0.0.0", () => {
  printLinks(" Demify pulse gateway (camera pulse estimate for a demo,\n not a medical measurement)");
});

// The laptop joined another network (new hotspot, reconnect): make a matching
// certificate and switch to it without a restart, then print the new link.
const NET_CHECK_MS = Number(process.env.NET_CHECK_MS) || 10_000;
let netCheckBusy = false;
setInterval(async () => {
  if (netCheckBusy) return;
  const ips = localIPv4();
  if (JSON.stringify(ips) === JSON.stringify(tls.ips)) return;
  netCheckBusy = true;
  try {
    const next = await ensureCert();
    server.setSecureContext({ key: next.key, cert: next.cert });
    tls = next;
    console.log(`${stamp()} network changed: now ${ips.join(", ")}`);
    printLinks(" Network changed: NEW phone link (accept the certificate warning again)");
  } catch (err) {
    console.warn(`${stamp()} could not renew the certificate after a network change: ${err.message}`);
  } finally {
    netCheckBusy = false;
  }
}, NET_CHECK_MS).unref();

if (env.HTTP_PORT) {
  // Fallback for the Chrome flag "Insecure origins treated as secure" (see README).
  http
    .createServer(handler)
    .listen(env.HTTP_PORT, "0.0.0.0", () => console.log(`${stamp()} plain HTTP fallback on port ${env.HTTP_PORT}`));
}

function shutdown() {
  client.publish(STATUS_TOPIC, "offline", { qos: 0, retain: true }, () => client.end(true));
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
