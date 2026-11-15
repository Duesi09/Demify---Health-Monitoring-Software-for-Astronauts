#!/usr/bin/env node
// HTTPS access for the phone pulse demo.
//
// Phone browsers only allow the camera on https:// pages (or localhost). This
// script listens on https://<laptop-ip>:8443 with a self-signed certificate
// and forwards everything to Demify on http://127.0.0.1:3000 (npm run dev,
// npm start or the Docker container). The phone opens /pulse through it,
// so the page and its POST /api/readings stay on one origin.
//
//   npm run pulse:https
//   npm run pulse:https -- --port 8443 --target http://127.0.0.1:3000
//
// The certificate is created on the first start and kept in .pulse-cert/
// (git-ignored). The phone shows "connection is not private" once: tap
// Advanced, then Proceed. Stop with Ctrl+C.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CERT_DIR = path.join(ROOT, ".pulse-cert");

const HELP = `Usage: npm run pulse:https [-- options]

Options
  --port <n>        HTTPS port for the phone        (default 8443)
  --target <url>    Where Demify runs               (default http://127.0.0.1:3000)
  --crew <id>       Crew member for the phone page  (default test)
  -h, --help        Show this help`;

function fail(message) {
  console.error(`pulse-https: ${message}\n\n${HELP}`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { port: 8443, target: "http://127.0.0.1:3000", crew: "test" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(HELP);
      process.exit(0);
    }
    const m = /^--(port|target|crew)(?:=(.*))?$/.exec(arg);
    if (!m) fail(`Unknown option "${arg}"`);
    const value = m[2] ?? argv[++i];
    if (value === undefined || value === "") fail(`Missing value for --${m[1]}`);
    if (m[1] === "port") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) fail("--port must be 1..65535");
      opts.port = n;
    } else opts[m[1]] = value;
  }
  try {
    opts.targetUrl = new URL(opts.target);
  } catch {
    fail(`--target "${opts.target}" is not a valid URL`);
  }
  if (opts.targetUrl.protocol !== "http:") fail("--target must be an http:// URL");
  return opts;
}

/** Same ranking as src/lib/pulse/lan.ts (rankLanInterfaces): Wi-Fi first, virtual and host-only adapters last or left out. */
function lanAddresses() {
  const WIRELESS = /wi-?fi|wlan|wireless|drahtlos|^en0$|^wl/i;
  const VIRTUAL = /docker|veth|br-|vethernet|wsl|virtualbox|vmware|vmnet|hyper-v|tailscale|zerotier|host-only/i;
  const score = (ip, adapter) =>
    /^192\.168\.(56|99)\./.test(ip)
      ? 9
      : WIRELESS.test(adapter)
        ? 0
        : ip.startsWith("192.168.")
          ? 1
          : ip.startsWith("10.")
            ? 2
            : /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
              ? 4
              : 3;
  const out = new Map();
  for (const [adapter, list] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(adapter)) continue;
    for (const a of list ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith("127.") || a.address.startsWith("169.254.")) continue;
      if (!out.has(a.address)) out.set(a.address, { address: a.address, adapter, score: score(a.address, adapter) });
    }
  }
  return [...out.values()].sort((x, y) => x.score - y.score || x.address.localeCompare(y.address));
}

/** Self-signed certificate for localhost and the current LAN addresses; regenerated when they change. */
async function certificate(ips) {
  const keyFile = path.join(CERT_DIR, "key.pem");
  const certFile = path.join(CERT_DIR, "cert.pem");
  const infoFile = path.join(CERT_DIR, "hosts.json");
  const hosts = ["localhost", "127.0.0.1", ...ips];
  if (existsSync(keyFile) && existsSync(certFile) && existsSync(infoFile)) {
    try {
      const info = JSON.parse(readFileSync(infoFile, "utf8"));
      const fresh = Date.parse(info.notAfter) - Date.now() > 24 * 3600_000;
      if (fresh && hosts.every((h) => info.hosts.includes(h))) {
        return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
      }
    } catch {
      // regenerate below
    }
  }
  let selfsigned;
  try {
    selfsigned = (await import("selfsigned")).default;
  } catch {
    fail("The package 'selfsigned' is missing. Run npm ci (Windows PowerShell: npm.cmd ci) in the Demify folder first.");
  }
  const notBeforeDate = new Date(Date.now() - 3600_000);
  const notAfterDate = new Date(Date.now() + 30 * 24 * 3600_000);
  const pems = await selfsigned.generate([{ name: "commonName", value: "Demify pulse demo" }], {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: hosts.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? { type: 7, ip: h } : { type: 2, value: h })),
      },
    ],
  });
  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(keyFile, pems.private, { mode: 0o600 });
  writeFileSync(certFile, pems.cert);
  writeFileSync(infoFile, JSON.stringify({ hosts, notAfter: notAfterDate.toISOString() }, null, 2));
  return { key: pems.private, cert: pems.cert };
}

/** Request headers for Demify: unchanged Host and Origin (same-origin check), plus the usual forwarding headers. */
function forwardHeaders(req) {
  const headers = { ...req.headers };
  const peer = req.socket.remoteAddress ?? "";
  headers["x-forwarded-for"] = headers["x-forwarded-for"] ? `${headers["x-forwarded-for"]}, ${peer}` : peer;
  headers["x-forwarded-proto"] = "https";
  if (req.headers.host) headers["x-forwarded-host"] = req.headers.host;
  return headers;
}

const NOT_RUNNING = (target) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demify not running</title><body style="font-family:system-ui;padding:24px;max-width:520px">
<h1>Demify is not running</h1><p>The HTTPS access works, but Demify does not answer on ${target}.</p>
<p>Start Demify on the laptop (Docker container or <code>npm run dev</code>), then reload this page.</p></body>`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const lan = lanAddresses();
  const ips = lan.map((e) => e.address);
  const tls = await certificate(ips);
  const target = opts.targetUrl;

  const server = https.createServer(tls, (req, res) => {
    // Links in the style of the earlier demify-pulse gateway
    // (https://<ip>:8443/?token=...&crew=test) open the phone page directly.
    // The token is not needed here and is dropped.
    if (req.method === "GET" && req.url) {
      const u = new URL(req.url, "https://pulse.local");
      if (u.pathname === "/" && (u.searchParams.has("crew") || u.searchParams.has("token"))) {
        const crew = u.searchParams.get("crew") || opts.crew;
        res.writeHead(302, { location: `/pulse?crew=${encodeURIComponent(crew)}`, "cache-control": "no-store" });
        res.end();
        return;
      }
    }
    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        path: req.url,
        headers: forwardHeaders(req),
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.statusMessage, up.rawHeaders);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(NOT_RUNNING(target.origin));
      } else res.destroy();
    });
    // Phone gone (tab closed, network lost): stop waiting for Demify too.
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });

  // WebSocket upgrades (npm run dev hot reload); the demo itself needs none.
  server.on("upgrade", (req, socket, head) => {
    const upstream = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req),
    });
    upstream.on("upgrade", (up, upSocket, upHead) => {
      const lines = [`HTTP/1.1 ${up.statusCode} ${up.statusMessage}`];
      for (let i = 0; i < up.rawHeaders.length; i += 2) lines.push(`${up.rawHeaders[i]}: ${up.rawHeaders[i + 1]}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
      if (upHead?.length) socket.write(upHead);
      if (head?.length) upSocket.write(head);
      upSocket.pipe(socket).pipe(upSocket);
      upSocket.on("error", () => socket.destroy());
      socket.on("error", () => upSocket.destroy());
    });
    upstream.on("response", (up) => {
      socket.end(`HTTP/1.1 ${up.statusCode ?? 502} ${up.statusMessage ?? "Bad Gateway"}\r\n\r\n`);
    });
    upstream.on("error", () => socket.destroy());
    upstream.setTimeout(15_000, () => upstream.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.end();
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") fail(`Port ${opts.port} is already in use (is pulse:https or the demify-pulse gateway already running?).`);
    if (err.code === "EACCES") fail(`No permission to listen on port ${opts.port}.`);
    throw err;
  });

  const demifyAnswers = () =>
    fetch(new URL("/api/health", target), { signal: AbortSignal.timeout(3000) })
      .then((r) => r.status < 500)
      .catch(() => false);

  server.listen(opts.port, "0.0.0.0", async () => {
    const up = await demifyAnswers();
    if (!up) {
      // Keep checking, so starting Demify after this script is fine too.
      const timer = setInterval(async () => {
        if (await demifyAnswers()) {
          clearInterval(timer);
          console.log(`  Demify answers now on ${target.origin}: OK`);
        }
      }, 3000);
    }
    console.log("");
    console.log("Demify phone pulse demo: HTTPS access is running.");
    console.log(`  forwarding to ${target.origin} ${up ? "(Demify answers: OK)" : "(Demify does NOT answer yet: start it!)"}`);
    console.log("");
    if (lan.length === 0) {
      console.log("  No network address found. Connect the laptop to the phone's hotspot and restart this script.");
    } else {
      const link = (ip) => `https://${ip}:${opts.port}/pulse?crew=${encodeURIComponent(opts.crew)}`;
      const [best, ...others] = lan;
      // QR first, links last: the links stay visible at the bottom of the window.
      try {
        const QRCode = (await import("qrcode")).default;
        console.log(await QRCode.toString(link(best.address), { type: "terminal", small: true }));
      } catch {
        // QR in the terminal is a convenience; the links below are enough.
      }
      console.log(`  >> Phone link:   ${link(best.address)}   (adapter: ${best.adapter})`);
      for (const e of others) console.log(`     or:           ${link(e.address)}   (adapter: ${e.adapter})`);
      console.log(`  >> QR code on the laptop: ${target.origin.replace("127.0.0.1", "localhost")}/pulse/connect?host=${best.address}`);
      console.log("     Wrong address? Use the IPv4 address of your Wi-Fi adapter (ipconfig):");
      console.log(`     ${target.origin.replace("127.0.0.1", "localhost")}/pulse/connect?host=<that address>`);
      console.log("");
    }
    console.log("  On the phone (Chrome): 'connection is not private' -> Advanced -> Proceed.");
    console.log("  Windows firewall prompt: tick BOTH 'Private' and 'Public' networks and allow");
    console.log("  (a new phone hotspot is usually a 'Public' network in Windows).");
    console.log("  Stop with Ctrl+C.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
