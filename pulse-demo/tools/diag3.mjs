// Quality margin: highest quality pure noise reaches vs. lowest weak-signal quality.
import { createPpgEstimator } from "../public/ppg.js";
import { synthFrames, run } from "../test/synth.mjs";
const minQ = Number(process.argv[2] ?? 0.5);
let noisePub = 0, noiseMax = 0;
for (const fps of [15, 24, 30, 60]) for (let seed = 1; seed <= 40; seed++) {
  const res = run(createPpgEstimator({ minQuality: minQ }), synthFrames({ pureNoise: true, noise: 0.5, fps, seconds: 30, seed }));
  noisePub += res.filter((r) => r.publishable).length;
  noiseMax = Math.max(noiseMax, ...res.map((r) => r.quality));
}
console.log(`minQuality ${minQ}: pure noise max quality ${noiseMax.toFixed(2)}, published polls ${noisePub} (160 runs)`);
const bad = [];
for (const fps of [15, 24, 30, 60]) for (const bpm of [48, 60, 72, 90, 120, 150, 175]) {
  const res = run(createPpgEstimator({ minQuality: minQ }), synthFrames({ bpm, fps, amp: 0.003, noise: 0.12, jitter: 0.25, drop: 0.08, seconds: 25, seed: 7 + fps * 1000 + bpm })).filter((r) => r.tSec >= 10);
  const pub = res.filter((r) => r.publishable);
  const maxErr = Math.max(0, ...pub.map((r) => Math.abs(r.bpm - bpm)));
  if (pub.length < 12 || maxErr > 5 || !res[0].publishable) bad.push(`${fps}fps ${bpm}: pub ${pub.length}/15 maxErr ${maxErr} first ${res[0].publishable}`);
}
console.log("noisy weak-signal cases below bar:", bad.length ? "\n  " + bad.join("\n  ") : "none");
