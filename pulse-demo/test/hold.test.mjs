// Demo hold (public/hold.js): locks on rough estimates, drifts, releases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoHold } from "../public/hold.js";

function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
const finger = (extra = {}) => ({ fingerOn: true, publishable: false, bpm: null, quality: 0.3, windowSeconds: 4, candidate: 74, ...extra });

test("locks after two agreeing rough estimates, even in the weak (yellow) range", () => {
  const h = createDemoHold({}, seeded());
  assert.equal(h.update(finger({ candidate: 75 }), 0).held, false);
  const r = h.update(finger({ candidate: 77 }), 1000);
  assert.equal(r.held, true);
  assert.equal(r.bpm, 76);
});

test("ignores estimates before 3 s of signal or with almost no quality", () => {
  const h = createDemoHold({}, seeded());
  h.update(finger({ windowSeconds: 2 }), 0);
  h.update(finger({ windowSeconds: 2 }), 1000);
  h.update(finger({ quality: 0.05 }), 2000);
  assert.equal(h.locked, false);
});

test("does not lock on disagreeing estimates, then falls back to the median after 9 s", () => {
  const h = createDemoHold({}, seeded());
  const vals = [60, 90, 62, 95, 70, 100, 72, 88, 66];
  let r;
  vals.forEach((c, i) => (r = h.update(finger({ candidate: c }), i * 1000)));
  assert.equal(h.locked, false);
  r = h.update(finger({ candidate: 80 }), 9000);
  assert.equal(r.held, true);
  assert.ok(r.bpm >= 70 && r.bpm <= 90, `fallback ${r.bpm}`);
});

test("drift stays within a few bpm and actually moves", () => {
  const h = createDemoHold({}, seeded(7));
  h.update(finger(), 0);
  h.update(finger(), 1000);
  const seen = new Set();
  for (let i = 2; i < 300; i++) {
    const r = h.update(finger({ candidate: null, quality: 0 }), i * 1000);
    assert.ok(r.held && r.bpm >= 74 - 6 && r.bpm <= 74 + 6, `bpm ${r.bpm}`);
    seen.add(r.bpm);
  }
  assert.ok(seen.size >= 5, "value should vary a little");
});

test("clamps implausible rough rates into 55-110", () => {
  const h = createDemoHold({}, seeded());
  h.update(finger({ candidate: 160 }), 0);
  const r = h.update(finger({ candidate: 162 }), 1000);
  assert.equal(r.bpm, 110);
});

test("follows a real published value", () => {
  const h = createDemoHold({ driftMax: 0 }, () => 0.5);
  h.update(finger({ candidate: 70 }), 0);
  h.update(finger({ candidate: 70 }), 1000);
  let r;
  for (let i = 2; i < 20; i++) r = h.update(finger({ publishable: true, bpm: 90 }), i * 1000);
  assert.ok(Math.abs(r.bpm - 90) <= 2, `followed to ${r.bpm}`);
});

test("short slip keeps the value, lifting the finger 2 s ends the hold", () => {
  const h = createDemoHold({}, seeded());
  h.update(finger(), 0);
  h.update(finger(), 1000);
  const off = { fingerOn: false, publishable: false, quality: 0, windowSeconds: 0, candidate: null };
  assert.equal(h.update(off, 2000).held, true);
  assert.equal(h.update(finger({ candidate: null }), 3000).held, true);
  assert.equal(h.update(off, 4000).held, true);
  assert.equal(h.update(off, 5000).held, true);
  const r = h.update(off, 6000);
  assert.equal(r.held, false);
  assert.equal(r.bpm, null);
});
