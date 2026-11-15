import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createPpgEstimator } from "../public/ppg.js";
import { synthFrames, run, pulseShape } from "./synth.mjs";

const FPS = [15, 24, 30, 60];
const BPMS = [48, 60, 72, 90, 120, 150, 175];

/** Every published value from tFrom on is within tol; at least one is published by tFrom. */
function assertTracks(results, target, tol, tFrom, label) {
  const late = results.filter((r) => r.tSec >= tFrom);
  const published = late.filter((r) => r.publishable);
  assert.ok(late[0]?.publishable, `${label}: nothing published at ${tFrom} s (${JSON.stringify(late[0])})`);
  for (const r of published) {
    const target_ = typeof target === "function" ? target(r.tSec) : target;
    assert.ok(
      Math.abs(r.bpm - target_) <= tol,
      `${label}: at ${r.tSec} s published ${r.bpm}, expected ${target_} ±${tol}`,
    );
  }
  // Publishing should be the rule, not the exception, once locked.
  assert.ok(published.length >= late.length * 0.8, `${label}: only ${published.length}/${late.length} polls published`);
}

describe("accuracy, clean signals (±3 bpm after 10 s)", () => {
  for (const fps of FPS) {
    for (const bpm of BPMS) {
      test(`${bpm} bpm at ${fps} fps`, () => {
        for (const [i, amp] of [0.005, 0.01, 0.02].entries()) {
          const est = createPpgEstimator();
          const frames = synthFrames({ bpm, fps, amp, noise: 0.1, seconds: 25, seed: fps * 1000 + bpm * 10 + i });
          assertTracks(run(est, frames), bpm, 3, 10, `amp ${amp}`);
        }
      });
    }
  }
});

describe("accuracy, noisy signals (±5 bpm after 10 s)", () => {
  // Weakest allowed pulse (0.3 % of baseline), more noise, 25 % frame jitter,
  // 8 % dropped frames. The accuracy bar applies to every published value.
  // Coverage: at least half of the polls from 10 s on must publish, except in
  // the corner where the pulse is too weak to resolve (175 bpm at 15-24 fps,
  // about 5-8 frames per beat): there the estimator must stay silent or be
  // right, never publish a wrong number.
  for (const fps of FPS) {
    for (const bpm of BPMS) {
      test(`${bpm} bpm at ${fps} fps, 0.3 % amplitude`, () => {
        const est = createPpgEstimator();
        const frames = synthFrames({
          bpm,
          fps,
          amp: 0.003,
          noise: 0.12,
          jitter: 0.25,
          drop: 0.08,
          seconds: 25,
          seed: 7 + fps * 1000 + bpm,
        });
        const late = run(est, frames).filter((r) => r.tSec >= 10);
        const published = late.filter((r) => r.publishable);
        for (const r of published) {
          assert.ok(Math.abs(r.bpm - bpm) <= 5, `at ${r.tSec} s published ${r.bpm}, expected ${bpm} ±5`);
        }
        const tooWeak = bpm >= 175 && fps <= 24;
        if (!tooWeak) {
          assert.ok(published.length >= late.length / 2, `only ${published.length}/${late.length} polls published`);
        }
      });
    }
  }
});

describe("accuracy, typical phone signal with noise (±5 bpm, 1 % amplitude)", () => {
  for (const fps of FPS) {
    for (const bpm of BPMS) {
      test(`${bpm} bpm at ${fps} fps`, () => {
        const est = createPpgEstimator();
        const frames = synthFrames({
          bpm,
          fps,
          amp: 0.01,
          noise: 0.2,
          jitter: 0.25,
          drop: 0.08,
          seconds: 25,
          seed: 99 + fps * 1000 + bpm,
        });
        const results = run(est, frames);
        if (bpm >= 175 && fps <= 24) {
          // Same hard corner as above: every published value right, some published.
          const pub = results.filter((r) => r.tSec >= 10 && r.publishable);
          assert.ok(pub.length >= 5, `only ${pub.length} polls published`);
          for (const r of pub) assert.ok(Math.abs(r.bpm - bpm) <= 5, `at ${r.tSec} s published ${r.bpm}`);
        } else {
          assertTracks(results, bpm, 5, 10, "noisy 1 %");
        }
      });
    }
  }
});

describe("no publish when it should not", () => {
  test("no finger (green and blue as bright as red)", () => {
    const est = createPpgEstimator();
    const res = run(est, synthFrames({ finger: () => false, seconds: 20 }));
    assert.ok(res.every((r) => !r.publishable && !r.fingerOn));
    assert.equal(res.at(-1).reason, "no finger");
  });

  test("too dark", () => {
    const est = createPpgEstimator();
    const res = run(est, synthFrames({ baseline: 40, drift: 0, steps: [], seconds: 15 }));
    assert.ok(res.every((r) => !r.publishable));
    assert.equal(res.at(-1).reason, "too dark");
  });

  test("pure noise on a finger-coloured frame", () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const fps of [15, 30]) {
        const est = createPpgEstimator();
        const res = run(est, synthFrames({ pureNoise: true, noise: 0.5, fps, seconds: 30, seed }));
        const bad = res.filter((r) => r.publishable);
        assert.equal(bad.length, 0, `seed ${seed} fps ${fps}: published ${JSON.stringify(bad[0])}`);
      }
    }
  });

  test("saturation (pressing too hard / too bright)", () => {
    const est = createPpgEstimator();
    const res = run(est, synthFrames({ baseline: 262, drift: 0, steps: [], amp: 0.01, seconds: 15 }));
    assert.ok(res.every((r) => !r.publishable));
    assert.match(res.at(-1).reason, /saturated/);
  });

  test("nothing in the first 5 s", () => {
    for (const fps of FPS) {
      const est = createPpgEstimator();
      const res = run(est, synthFrames({ fps, amp: 0.02, noise: 0.05, steps: [], seconds: 12 }));
      assert.ok(res.filter((r) => r.tSec <= 5).every((r) => !r.publishable), `fps ${fps}`);
    }
  });

  test("no camera frames", () => {
    const est = createPpgEstimator();
    run(est, synthFrames({ seconds: 12 }));
    const r = est.poll(1000 + 15_000);
    assert.equal(r.publishable, false);
    assert.equal(r.reason, "no camera frames");
  });
});

describe("harmonics and dynamics", () => {
  test("strong dicrotic wave does not double the rate", () => {
    // Sanity: the shape really has a strong 2nd harmonic.
    let h1 = 0;
    let h2 = 0;
    for (let i = 0; i < 1000; i++) {
      const p = i / 1000;
      const v = pulseShape(p, 0.8);
      h1 += v * Math.cos(2 * Math.PI * p);
      h2 += v * Math.cos(4 * Math.PI * p);
    }
    assert.ok(Math.abs(h2) > 0.2 * Math.abs(h1), "test shape should have a strong 2nd harmonic");
    for (const bpm of [48, 55, 60, 72, 85]) {
      for (const fps of [15, 30]) {
        const est = createPpgEstimator();
        const res = run(est, synthFrames({ bpm, fps, dicrotic: 0.8, amp: 0.01, seconds: 25, seed: bpm + fps }));
        assertTracks(res, bpm, 3, 10, `dicrotic ${bpm} bpm ${fps} fps`);
      }
    }
  });

  test("recovers within 10 s after lifting and replacing the finger", () => {
    for (const fps of [15, 30]) {
      const est = createPpgEstimator();
      const off = (t) => !(t >= 14 && t < 17);
      const res = run(est, synthFrames({ bpm: 72, fps, seconds: 35, finger: off, seed: 3 + fps }));
      const during = res.filter((r) => r.tSec >= 14.5 && r.tSec < 17);
      assert.ok(during.every((r) => !r.publishable && !r.fingerOn), `fps ${fps}: published while lifted`);
      const after = res.filter((r) => r.tSec >= 17 && r.tSec <= 23);
      assert.ok(after.every((r) => !r.publishable), `fps ${fps}: published before 6 s of new signal`);
      assertTracks(res, 72, 3, 27, `fps ${fps} after replacing`);
    }
  });

  test("finger shifted (big brightness jump) does not restart the measurement", () => {
    for (const fps of [15, 30]) {
      const est = createPpgEstimator();
      const res = run(est, synthFrames({ bpm: 72, fps, seconds: 25, steps: [{ at: 12, factor: 0.6 }], seed: 21 + fps }));
      assert.ok(res.find((r) => r.tSec === 12).publishable, `fps ${fps}: publishing before the jump`);
      // Old behaviour restarted: nothing for 6+ s. Now at most a short pause.
      const back = res.find((r) => r.tSec > 12 && r.publishable);
      assert.ok(back && back.tSec <= 16, `fps ${fps}: back at ${back?.tSec}`);
      for (const r of res.filter((x) => x.publishable)) assert.ok(Math.abs(r.bpm - 72) <= 3, `fps ${fps}: ${r.tSec} s -> ${r.bpm}`);
    }
  });

  test("continuous movement pauses publishing, then it resumes without a restart", () => {
    const est = createPpgEstimator();
    const jitterSteps = Array.from({ length: 10 }, (_, i) => ({ at: 12 + i * 0.3, factor: i % 2 ? 1 / 1.12 : 1.12 }));
    const res = run(est, synthFrames({ bpm: 66, seconds: 25, steps: jitterSteps, seed: 5 }));
    const during = res.filter((r) => r.tSec >= 13 && r.tSec <= 15);
    assert.ok(during.every((r) => !r.publishable), "no values while the finger keeps moving");
    assert.match(during[0].reason, /moving/);
    const back = res.find((r) => r.tSec > 15 && r.publishable);
    assert.ok(back && back.tSec <= 20, `resumes at ${back?.tSec}`);
    for (const r of res.filter((x) => x.publishable)) assert.ok(Math.abs(r.bpm - 66) <= 3, `${r.tSec} s -> ${r.bpm}`);
  });

  test("a short slip of the finger (< 0.8 s) does not restart", () => {
    const est = createPpgEstimator();
    const res = run(est, synthFrames({ bpm: 80, seconds: 22, finger: (t) => !(t >= 12 && t < 12.5), seed: 9 }));
    const back = res.find((r) => r.tSec > 12 && r.publishable);
    assert.ok(back && back.tSec <= 15, `back at ${back?.tSec}`);
    for (const r of res.filter((x) => x.publishable)) assert.ok(Math.abs(r.bpm - 80) <= 3, `${r.tSec} s -> ${r.bpm}`);
  });

  test("follows a change from 70 to 110 bpm within about 10 s", () => {
    for (const fps of [15, 30, 60]) {
      const est = createPpgEstimator();
      const bpm = (t) => (t < 15 ? 70 : 110);
      const res = run(est, synthFrames({ bpm, fps, seconds: 35, seed: 11 + fps }));
      assertTracks(res.filter((r) => r.tSec <= 15), 70, 3, 10, `fps ${fps} before`);
      const at = res.find((r) => r.tSec === 25);
      assert.ok(at.publishable && Math.abs(at.bpm - 110) <= 3, `fps ${fps}: at 25 s ${JSON.stringify(at)}`);
      assertTracks(res, 110, 3, 25, `fps ${fps} after`);
    }
  });

  test("exposure steps are stitched, not reset", () => {
    const est = createPpgEstimator();
    const steps = [{ at: 9, factor: 1.1 }, { at: 13, factor: 0.92 }];
    const res = run(est, synthFrames({ bpm: 66, steps, seconds: 20 }));
    assertTracks(res, 66, 3, 10, "steps");
  });

  test("beat flag and waveform", () => {
    const est = createPpgEstimator();
    const res = run(est, synthFrames({ bpm: 72, seconds: 15 }));
    assert.ok(res.filter((r) => r.tSec > 6).filter((r) => r.beat).length >= 7);
    const w = est.filteredTail(90);
    assert.equal(w.length, 90);
    assert.ok(w.every(Number.isFinite));
    assert.ok(Math.max(...w) > 0.2);
  });

  test("reset() clears everything", () => {
    const est = createPpgEstimator();
    run(est, synthFrames({ seconds: 15 }));
    est.reset();
    assert.equal(est.poll(17_000).publishable, false);
    assert.deepEqual(est.filteredTail(10), []);
  });
});
