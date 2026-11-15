// Diagnostic: per-case quality and error of the estimator on synthetic data.
import { createPpgEstimator } from "../public/ppg.js";
import { synthFrames, run } from "../test/synth.mjs";
const mode = process.argv[2] ?? "clean";
const rows = [];
for (const fps of [15, 24, 30, 60]) for (const bpm of [48, 60, 72, 90, 120, 150, 175]) {
  const o = mode === "noisy"
    ? { bpm, fps, amp: 0.003, noise: 0.12, jitter: 0.25, drop: 0.08, seconds: 25, seed: 7 + fps * 1000 + bpm }
    : { bpm, fps, amp: 0.005, noise: 0.1, seconds: 25, seed: fps * 1000 + bpm * 10 };
  const res = run(createPpgEstimator(), synthFrames(o)).filter((r) => r.tSec >= 10);
  const pub = res.filter((r) => r.publishable);
  const errs = pub.map((r) => r.bpm - bpm);
  const q = res.map((r) => r.quality);
  rows.push(`${fps}fps ${bpm}bpm  pub ${pub.length}/${res.length}  err ${errs.length ? Math.min(...errs) + ".." + Math.max(...errs) : "-"}  q ${Math.min(...q).toFixed(2)}..${Math.max(...q).toFixed(2)}`);
}
if (mode === "noise") {
  rows.length = 0;
  for (const fps of [15, 30]) for (let seed = 1; seed <= 12; seed++) {
    const res = run(createPpgEstimator(), synthFrames({ pureNoise: true, noise: 0.5, fps, seconds: 30, seed }));
    const q = res.filter((r) => r.tSec > 6).map((r) => r.quality);
    rows.push(`noise fps ${fps} seed ${seed}: q max ${Math.max(...q).toFixed(2)} pub ${res.filter((r) => r.publishable).length}`);
  }
}
console.log(rows.join("\n"));
