// Sweep publish-rule parameters: false publishes on pure noise vs. coverage/accuracy on signals.
import { createPpgEstimator } from "../public/ppg.js";
import { synthFrames, run } from "../test/synth.mjs";
const combos = [];
for (const minQuality of [0.35, 0.4, 0.45, 0.5]) for (const maxSpread of [0.04, 0.06, 0.12]) for (const minStreak of [3, 4]) combos.push({ minQuality, maxSpread, minStreak });
for (const p of combos) {
  let noisePub = 0;
  for (const fps of [15, 24, 30, 60]) for (let seed = 1; seed <= 80; seed++) {
    noisePub += run(createPpgEstimator(p), synthFrames({ pureNoise: true, noise: 0.5, fps, seconds: 30, seed: seed * 7919 })).filter((r) => r.publishable).length;
  }
  let wrong = 0, covered = 0, total = 0, firstOk = 0, cases = 0;
  for (const [amp, noise, base] of [[0.003, 0.12, 7], [0.01, 0.2, 99], [0.005, 0.1, 3]]) for (const fps of [15, 24, 30, 60]) for (const bpm of [48, 60, 72, 90, 120, 150, 175]) {
    const late = run(createPpgEstimator(p), synthFrames({ bpm, fps, amp, noise, jitter: 0.25, drop: 0.08, seconds: 25, seed: base + fps * 1000 + bpm })).filter((r) => r.tSec >= 10);
    const pub = late.filter((r) => r.publishable);
    wrong += pub.filter((r) => Math.abs(r.bpm - bpm) > 5).length;
    covered += pub.length; total += late.length; cases++;
    if (late[0].publishable) firstOk++;
  }
  console.log(`q>=${p.minQuality} spread<=${p.maxSpread} streak ${p.minStreak}: noise publishes ${noisePub} | signal wrong ${wrong}, coverage ${(100 * covered / total).toFixed(1)} %, locked by 10 s ${firstOk}/${cases}`);
}
