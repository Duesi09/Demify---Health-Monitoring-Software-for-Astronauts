// End-to-end test with a FAKE camera: Chromium plays a generated video of a
// reddish fingertip whose brightness follows a PPG waveform, the real phone
// page measures it, and Demify's live monitor must show the rate.
//
// Needs running: Demify (DEMIFY_URL), the broker, and `npm start`.
//   npm run test:e2e              (72 and 110 bpm)
//   node test/e2e.mjs 85          (one custom rate)

import { chromium } from "playwright";
import { open, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadEnv, ROOT } from "../lib/env.mjs";
import { rng, pulseShape } from "./synth.mjs";

const env = loadEnv();
const OUT = join(ROOT, "test", "out");
const W = 320;
const H = 240;
const FPS = 30;
// PARTIAL=1: the finger covers only the left 60 % of the frame; the rest is a
// bright grey room (tests the tile-based finger finder on the phone page).
const PARTIAL = process.env.PARTIAL === "1";

/** Seconds of video holding a whole number of beats, so the loop is seamless. */
function loopSeconds(bpm, target = 40) {
  const beats = Math.round((target * bpm) / 60);
  return (beats * 60) / bpm;
}

/** Writes a C420jpeg Y4M of a fingertip at `bpm`. */
async function makeY4m(bpm) {
  const seconds = loopSeconds(bpm);
  const frames = Math.round(seconds * FPS);
  const file = join(ROOT, "test", `fake-finger-${bpm}${PARTIAL ? "-partial" : ""}.y4m`);
  const frameBytes = W * H * 1.5;
  try {
    if ((await stat(file)).size > frames * frameBytes) return { file, seconds };
  } catch {
    /* generate */
  }
  const R = rng(bpm);
  const fh = await open(file, "w");
  await fh.write(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`);
  const buf = Buffer.alloc(6 + frameBytes);
  buf.write("FRAME\n", 0, "ascii");
  const ySize = W * H;
  const cSize = (W / 2) * (H / 2);
  for (let i = 0; i < frames; i++) {
    const phase = ((i / FPS) * bpm) / 60;
    const pulse = pulseShape(phase % 1, 0.5) / 1.1; // ~0..1
    // Fingertip over a lit flash: red, bright, little green and blue.
    // ~1 % pulse amplitude: more blood, darker.
    const k = 1 - 0.012 * pulse;
    const r = 205 * k;
    const g = 42 * k;
    const b = 32 * k;
    // JFIF full-range YCbCr.
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    // Per-frame noise is rounded into whole steps; dithering per pixel keeps
    // the average carrying sub-step changes like a real sensor does.
    let o = 6;
    const room = (fx) => PARTIAL && fx >= 0.6; // fraction of the width
    for (let p = 0; p < ySize; p++) {
      const v = room((p % W) / W) ? 185 : y;
      buf[o++] = Math.max(0, Math.min(255, Math.round(v + R.gauss() * 1.5)));
    }
    for (let p = 0; p < cSize; p++) {
      const v = room((p % (W / 2)) / (W / 2)) ? 128 : cb;
      buf[o++] = Math.max(0, Math.min(255, Math.round(v + R.gauss() * 0.7)));
    }
    for (let p = 0; p < cSize; p++) {
      const v = room((p % (W / 2)) / (W / 2)) ? 128 : cr;
      buf[o++] = Math.max(0, Math.min(255, Math.round(v + R.gauss() * 0.7)));
    }
    await fh.write(buf);
  }
  await fh.close();
  return { file, seconds };
}

async function live() {
  const res = await fetch(new URL(`/api/vitals/live?crewId=${env.CREW_ID}`, env.DEMIFY_URL), { signal: AbortSignal.timeout(3000) });
  return res.json();
}

async function preflight() {
  try {
    const v = await live();
    if (v.scenario) throw new Error(`a drill is running for ${env.CREW_ID}: end it first (sensor data is ignored during drills)`);
  } catch (err) {
    throw new Error(`Demify not usable at ${env.DEMIFY_URL}: ${err.message}`);
  }
  const { connect } = await import("node:net");
  await new Promise((resolve, reject) => {
    const sock = connect(env.PORT, "127.0.0.1", () => (sock.end(), resolve()));
    sock.on("error", () => reject(new Error(`gateway not listening on port ${env.PORT}: run "npm start" first`)));
  });
}

// HOLD=1: test the page as on stage (demo hold on). Default: strict estimator only.
const HOLD = process.env.HOLD === "1";

async function runCase(bpm) {
  const { file, seconds } = await makeY4m(bpm);
  console.log(`\n=== ${bpm} bpm (fake camera, ${seconds.toFixed(1)} s loop) ===`);
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${file}`,
    ],
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.grantPermissions(["camera"], { origin: `https://127.0.0.1:${env.PORT}` });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`https://127.0.0.1:${env.PORT}/?token=${encodeURIComponent(env.PULSE_TOKEN)}&crew=${env.CREW_ID}${HOLD ? "" : "&hold=0"}`);
    await page.getByRole("button", { name: "Start" }).click();
    const t0 = Date.now();
    let firstPagePublish = null;
    let firstDemify = null;
    let pageBpm = null;
    let demify = null;
    // The demo hold drifts up to about +/-5.5 bpm around the locked value.
    const tol = HOLD ? 10 : 4;
    const lo = bpm - tol;
    const hi = bpm + tol;
    while (Date.now() - t0 < 25_000) {
      await page.waitForTimeout(1000);
      const last = await page.evaluate(() => window.__pulse?.last ?? null);
      if (last?.publishable) {
        pageBpm = last.bpm;
        if (firstPagePublish === null) firstPagePublish = (Date.now() - t0) / 1000;
      }
      demify = await live();
      if (firstDemify === null && demify.hr >= lo && demify.hr <= hi && demify.source !== "simulated") {
        firstDemify = (Date.now() - t0) / 1000;
      }
      process.stdout.write(
        `  t=${String(Math.round((Date.now() - t0) / 1000)).padStart(2)} s  page ${last?.publishable ? last.bpm : "--"} (${last?.reason ?? "?"}, q ${last?.quality ?? "-"}, ${last?.fps ?? 0} fps)  Demify hr ${demify.hr} ${demify.source}\n`,
      );
    }
    await mkdir(OUT, { recursive: true });
    await page.screenshot({ path: join(OUT, `phone-${bpm}${PARTIAL ? "-partial" : ""}.png`), fullPage: true });
    const shownBpm = await page.locator("#bpm").textContent();
    console.log(`  page shows ${shownBpm} bpm; first publish on page after ${firstPagePublish} s; Demify in range after ${firstDemify} s`);
    assert.deepEqual(errors, [], `page errors: ${errors.join("; ")}`);
    assert.ok(pageBpm !== null && pageBpm >= lo && pageBpm <= hi, `page bpm ${pageBpm} not in ${lo}-${hi}`);
    assert.ok(Number(shownBpm) >= lo && Number(shownBpm) <= hi, `page shows ${shownBpm}`);
    assert.ok(demify.hr >= lo && demify.hr <= hi, `Demify hr ${demify.hr} not in ${lo}-${hi}`);
    assert.ok(["mixed", "sensor"].includes(demify.source), `Demify source ${demify.source}`);
    console.log(`  PASS ${bpm} bpm${HOLD ? " (demo hold)" : ""}`);
    return { bpm, pageBpm, demifyHr: demify.hr, source: demify.source, firstPagePublish, firstDemify };
  } finally {
    await browser.close();
  }
}

const rates = process.argv.slice(2).map(Number).filter(Boolean);
await preflight();
const results = [];
for (const bpm of rates.length ? rates : [72, 110]) results.push(await runCase(bpm));
console.log("\nE2E results:", JSON.stringify(results));
