// Fake phone: posts synthetic pulse estimates to the gateway like the phone
// page does (72 bpm drifting to 95 and back over 60 s), so the chain can be
// tested without a phone. Values are SIMULATED, not measured.
//
//   npm run fake-phone                 (uses .env: PORT, PULSE_TOKEN, CREW_ID)
//   node tools/fake-phone.mjs --bpm 80 (constant rate)
//   node tools/fake-phone.mjs --count 10
import https from "node:https";
import { loadEnv, stamp } from "../lib/env.mjs";

const env = loadEnv();
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const fixed = opt("bpm") ? Number(opt("bpm")) : null;
const count = Number(opt("count", Infinity));
const crewId = opt("crew", env.CREW_ID);
const base = opt("url", `https://127.0.0.1:${env.PORT}`);
// Only this local test tool accepts the gateway's self-signed certificate.
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      new URL("/api/pulse", base),
      {
        method: "POST",
        agent,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-pulse-token": env.PULSE_TOKEN },
        timeout: 5000,
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

console.log(`fake-phone: SIMULATED values for crew "${crewId}" -> ${base}/api/pulse (Ctrl+C stops)`);
const t0 = Date.now();
let sent = 0;
let stop = false;
process.on("SIGINT", () => (stop = true));
while (!stop && sent < count) {
  const t = (Date.now() - t0) / 1000;
  const bpm = fixed ?? Math.round(83.5 - 11.5 * Math.cos((2 * Math.PI * t) / 60));
  const quality = 0.8 + 0.1 * Math.sin(t / 7);
  try {
    const { status, text } = await post({ crewId, bpm, quality: Number(quality.toFixed(2)), fps: 30 });
    console.log(`${stamp()} ${bpm} bpm -> ${status} ${text}`);
  } catch (err) {
    console.log(`${stamp()} ${bpm} bpm -> gateway unreachable (${err.code ?? err.message}): is "npm start" running?`);
  }
  sent++;
  await new Promise((r) => setTimeout(r, 1000));
}
agent.destroy();
