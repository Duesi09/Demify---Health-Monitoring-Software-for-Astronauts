// Phone page: camera + flash -> fingertip pulse estimate -> POST /api/pulse.
// Camera pulse estimate for a demo, not a medical measurement.
import { createPpgEstimator } from "./ppg.js";
import { createDemoHold } from "./hold.js";

const params = new URLSearchParams(location.search);
const TOKEN = params.get("token") ?? "";
// Demo hold (hold.js) is on unless the link has hold=0.
const HOLD = params.get("hold") !== "0";
const CREW = /^[a-z0-9-]{1,32}$/.test(params.get("crew") ?? "") ? params.get("crew") : "cdr";

const $ = (id) => document.getElementById(id);
const ui = {
  bpm: $("bpm"),
  guide: $("guide"),
  qbar: $("qbar"),
  heart: $("heart"),
  wave: $("wave"),
  start: $("start"),
  camera: $("s-camera"),
  flash: $("s-flash"),
  finger: $("s-finger"),
  link: $("s-link"),
  send: $("s-send"),
  video: $("video"),
  grab: $("grab"),
  cells: $("cells"),
  cover: $("cover"),
};
$("crew").textContent = CREW;

function setStatus(el, text, cls = "") {
  el.textContent = text;
  el.className = cls;
}

if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  $("insecure").hidden = false;
  ui.start.disabled = true;
}

/* --------------------------------------------------------------------------- */
/* Camera and flash                                                             */
/* --------------------------------------------------------------------------- */

const BASE_VIDEO = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 30 },
};

let stream = null;
let track = null;
let torchOn = false;
let noTorch = false; // e.g. iPhone Safari: the page cannot switch the flash on

function stopStream(s) {
  s?.getTracks().forEach((t) => t.stop());
}

function hasTorch(t) {
  try {
    return t.getCapabilities?.().torch === true;
  } catch {
    return false;
  }
}

/**
 * Opens a rear camera that can switch on its torch. Samsung phones expose
 * several rear cameras (main, ultra-wide, tele); usually only the main one
 * controls the flash.
 */
async function openCamera() {
  let s = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { ...BASE_VIDEO, facingMode: { ideal: "environment" } },
  });
  let t = s.getVideoTracks()[0];
  if (hasTorch(t)) return { stream: s, track: t, torch: true };

  // Labels are only available after permission was granted.
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  // Main lens first: iPhone Pro "Back Dual/Triple Camera" are virtual devices
  // that jump to the ultra-wide (macro) lens when a finger comes close.
  const rank = (d) => (/^back camera$/i.test(d.label.trim()) ? 0 : /ultra|tele|dual|triple/i.test(d.label) ? 2 : 1);
  const rear = devices.filter((d) => /back|rear|environment/i.test(d.label)).sort((a, b) => rank(a) - rank(b));
  const currentId = t.getSettings?.().deviceId;
  for (const d of rear) {
    if (d.deviceId === currentId) continue; // already checked: no torch
    let candidate = null;
    try {
      stopStream(s); // phones rarely allow two cameras open at once
      s = null;
      candidate = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...BASE_VIDEO, deviceId: { exact: d.deviceId } },
      });
      const ct = candidate.getVideoTracks()[0];
      if (hasTorch(ct)) return { stream: candidate, track: ct, torch: true };
      stopStream(candidate);
    } catch {
      stopStream(candidate);
    }
  }
  // No torch anywhere: use the main rear lens if we know it, else the default.
  stopStream(s);
  const video = rear.length
    ? { ...BASE_VIDEO, deviceId: { exact: rear[0].deviceId } }
    : { ...BASE_VIDEO, facingMode: { ideal: "environment" } };
  s = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  return { stream: s, track: s.getVideoTracks()[0], torch: false };
}

async function setTorch(on) {
  if (!track || !hasTorch(track)) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    torchOn = on;
    return true;
  } catch {
    torchOn = false;
    return false;
  }
}

/* --------------------------------------------------------------------------- */
/* Frame loop                                                                   */
/* --------------------------------------------------------------------------- */

// Thresholds: with the flash a fingertip glows bright red; without it (iPhone
// Safari, lamp behind the finger) it is darker, so "finger" starts lower.
const FINGER_RATIO = 1.4;
const MIN_RED_TORCH = 50;
const MIN_RED_NO_TORCH = 25;
let est = createPpgEstimator({ fingerRatio: FINGER_RATIO, minRed: MIN_RED_TORCH });
const ctx = ui.grab.getContext("2d", { willReadFrequently: true });
const W = ui.grab.width;
const H = ui.grab.height;
let running = false;
let frameHandle = 0;

/*
 * Finger finder: the frame is split into a 4 x 4 grid and only the tiles the
 * fingertip actually covers are averaged, wherever the finger sits. A finger
 * that covers only part of the lens therefore still works. While a
 * measurement runs the selected tiles are frozen (a changing selection would
 * look like a jump in brightness); lifting the finger releases them.
 */
const GX = 4;
const GY = 4;
let minRed = MIN_RED_TORCH;
let liveCells = new Array(GX * GY).fill(false);
let cellColors = new Array(GX * GY).fill([0, 0, 0]);
let mask = liveCells.slice();
let maskFrozen = false;
let lastCellDraw = 0;

/** Tile sees a fingertip: red-dominant, bright enough, not clipped (glare / pressing hard). */
function fingerLike(r, g, b) {
  return r > FINGER_RATIO * g && r > FINGER_RATIO * b && r > minRed && r < 248;
}

function sampleFrame(t) {
  if (!running) return;
  if (ui.video.readyState >= 2) {
    ctx.drawImage(ui.video, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const sums = Array.from({ length: GX * GY }, () => [0, 0, 0, 0]);
    for (let y = 0; y < H; y++) {
      const cy = Math.min(GY - 1, Math.floor((y * GY) / H));
      for (let x = 0; x < W; x++) {
        const c = sums[cy * GX + Math.min(GX - 1, Math.floor((x * GX) / W))];
        const i = (y * W + x) * 4;
        c[0] += d[i];
        c[1] += d[i + 1];
        c[2] += d[i + 2];
        c[3]++;
      }
    }
    cellColors = sums.map(([r, g, b, n]) => [r / n, g / n, b / n]);
    liveCells = cellColors.map(([r, g, b]) => fingerLike(r, g, b));
    if (!maskFrozen) {
      mask = liveCells.slice();
    } else {
      // The finger slid: tiles that lost it drop out, the rest keep measuring
      // (the estimator stitches the small level change). All gone: search again.
      const kept = mask.map((m, k) => m && liveCells[k]);
      if (kept.some(Boolean)) mask = kept;
      else {
        maskFrozen = false;
        mask = liveCells.slice();
      }
    }
    // Average the selected tiles; with none selected use the whole frame, so
    // the estimator reports "no finger" / "too dark" as before.
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const useAll = !mask.some(Boolean);
    cellColors.forEach(([cr, cg, cb], k) => {
      if (useAll || mask[k]) {
        r += cr;
        g += cg;
        b += cb;
        n++;
      }
    });
    est.push(t, r / n, g / n, b / n);
    if (t - lastCellDraw > 120) {
      lastCellDraw = t;
      drawCells();
    }
  }
  scheduleFrame();
}

/** Live position aid: each tile in its camera colour, a green frame where the finger is used. */
const cctx = ui.cells.getContext("2d");
function drawCells() {
  const w = ui.cells.width;
  const h = ui.cells.height;
  const cw = w / GX;
  const ch = h / GY;
  cctx.clearRect(0, 0, w, h);
  cellColors.forEach(([r, g, b], k) => {
    const x = (k % GX) * cw;
    const y = Math.floor(k / GX) * ch;
    cctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    cctx.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    if (mask[k] || liveCells[k]) {
      cctx.lineWidth = 5;
      cctx.strokeStyle = mask[k] ? "#22c55e" : "#f2a900"; // nominal green / caution amber, bright on the dark grid
      cctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
    }
  });
  const covered = mask.filter(Boolean).length;
  ui.cover.textContent = covered
    ? `Finger on ${covered} of ${GX * GY} tiles${maskFrozen ? " (locked)" : ""}`
    : "Finger not found: cover the lens";
}

function scheduleFrame() {
  if (!running) return;
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    frameHandle = ui.video.requestVideoFrameCallback((now, meta) => {
      // captureTime shares performance.now()'s clock when the browser provides it.
      const t = meta?.captureTime && Math.abs(meta.captureTime - now) < 2000 ? meta.captureTime : now;
      sampleFrame(t);
    });
  } else {
    frameHandle = requestAnimationFrame((now) => sampleFrame(now));
  }
}

/* --------------------------------------------------------------------------- */
/* Sending to the laptop                                                        */
/* --------------------------------------------------------------------------- */

let lastHeartbeat = 0;
let sending = false;
let hiddenSince = 0;

async function post(body) {
  if (sending) return;
  sending = true;
  try {
    const res = await fetch("/api/pulse", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pulse-token": TOKEN },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    const time = new Date().toLocaleTimeString();
    if (res.ok && data.ok) {
      setStatus(ui.link, data.broker === "down" ? "connected, broker down" : "connected", data.broker === "down" ? "warn" : "ok");
      if (body.bpm !== undefined) {
        setStatus(ui.send, data.published ? `OK ${body.bpm} bpm, ${time}` : `OK (${data.reason ?? "not published"})`, "ok");
      }
    } else {
      setStatus(ui.link, "connected", "warn");
      setStatus(ui.send, `error: ${data.error ?? res.status}`, "bad");
    }
  } catch (err) {
    setStatus(ui.link, "laptop not reachable", "bad");
    setStatus(ui.send, `error: ${err.name === "TimeoutError" ? "timeout" : "network"}`, "bad");
  } finally {
    sending = false;
  }
}

/* --------------------------------------------------------------------------- */
/* UI                                                                           */
/* --------------------------------------------------------------------------- */

const wctx = ui.wave.getContext("2d");
function drawWave(samples) {
  const w = ui.wave.width;
  const h = ui.wave.height;
  wctx.clearRect(0, 0, w, h);
  wctx.strokeStyle = "#d5dde9"; // Demify --border
  wctx.lineWidth = 1;
  wctx.beginPath();
  wctx.moveTo(0, h / 2);
  wctx.lineTo(w, h / 2);
  wctx.stroke();
  if (samples.length < 2) return;
  wctx.strokeStyle = "#d03b3b"; // Demify --critical (heart red)
  wctx.lineWidth = 4;
  wctx.lineJoin = "round";
  wctx.beginPath();
  samples.forEach((v, i) => {
    const x = (i / (samples.length - 1)) * w;
    const y = h / 2 - Math.max(-1, Math.min(1, v)) * (h * 0.42);
    if (i === 0) wctx.moveTo(x, y);
    else wctx.lineTo(x, y);
  });
  wctx.stroke();
}

function flashHeart() {
  ui.heart.classList.remove("beat");
  void ui.heart.offsetWidth; // restart the animation
  ui.heart.classList.add("beat");
}

const GUIDE = {
  "no finger": "Cover the camera and flash with a fingertip.",
  "too dark": "Too dark: cover the camera and the flash together.",
  "saturated: press lighter": "Too bright: rest the finger more lightly.",
  "moving: keep still": "Keep still.",
  "weak signal: keep still, press lightly": "Weak signal: keep still, rest the finger lightly.",
  "locking on": "Locking on, keep still...",
  "no camera frames": "No camera frames.",
};

let lastOut = null;
const hold = createDemoHold();
let beatTimer = 0;
let beatBpm = null;

/** While the hold shows a value the heart keeps beating at that rate. */
function setBeat(bpm) {
  beatBpm = bpm;
  if (bpm && !beatTimer) {
    const loop = () => {
      if (!beatBpm) {
        beatTimer = 0;
        return;
      }
      flashHeart();
      beatTimer = setTimeout(loop, 60000 / beatBpm);
    };
    loop();
  }
}

function tick() {
  if (!running) return;
  const now = performance.now();
  const raw = est.poll(now);
  const h = HOLD ? hold.update(raw, now) : { held: false, bpm: null };
  // With the hold, the shown and sent value is the held one.
  const out = h.held ? { ...raw, publishable: true, bpm: h.bpm, quality: Math.max(raw.quality, 0.75), held: true } : raw;
  lastOut = out;
  setBeat(h.held ? h.bpm : null);
  // Lock the tile selection once a measurement segment is running; release it
  // when the finger is gone so the next placement is found again.
  if (out.fingerOn && out.windowSeconds >= 1) maskFrozen = true;
  if (!out.fingerOn) maskFrozen = false;

  ui.bpm.textContent = out.publishable ? String(out.bpm) : "--";
  let guide = GUIDE[out.reason] ?? out.reason;
  if (noTorch && out.reason === "too dark") guide = "Too dark: shine more light onto the back of your fingertip.";
  if (noTorch && out.reason === "no finger") guide = "Cover the main lens (big, top-left) with a fingertip, light behind it.";
  if (out.reason.startsWith("hold still")) guide = `Keep still: ${out.reason.split(": ")[1] ?? ""} more`;
  if (out.publishable) guide = "Measuring. Keep still.";
  if (out.held && !raw.fingerOn) guide = "Finger slipped: put it back on.";
  ui.guide.textContent = guide;
  ui.guide.className = out.publishable ? "guide ok" : "guide warn";
  ui.qbar.style.width = `${Math.round(out.quality * 100)}%`;
  ui.qbar.className = out.quality >= 0.5 ? "good" : "";
  ui.heart.classList.toggle("live", out.publishable);
  if (out.beat && out.fingerOn && !out.held) flashHeart();
  drawWave(est.filteredTail(150));

  setStatus(ui.camera, `on, ${out.fps} fps`, out.fps >= 20 ? "ok" : "warn");
  if (out.held) setStatus(ui.finger, raw.fingerOn ? "on, pulse found (demo hold)" : "slipped", raw.fingerOn ? "ok" : "warn");
  else if (out.fingerOn) setStatus(ui.finger, out.publishable ? "on, good signal" : `on: ${out.reason}`, out.publishable ? "ok" : "warn");
  else setStatus(ui.finger, out.reason || "no finger", "warn");

  if (document.hidden) return; // never send from a background tab
  // Finger off: the phone keeps showing the held value for a moment, but
  // sends nothing, so the laptop goes back to "--" right after.
  if (out.publishable && !(out.held && !raw.fingerOn)) {
    void post({ crewId: CREW, bpm: out.bpm, quality: out.quality, fps: out.fps });
  } else if (now - lastHeartbeat > 3000) {
    lastHeartbeat = now;
    void post({ crewId: CREW, fingerOn: out.fingerOn });
  }
}

/* --------------------------------------------------------------------------- */
/* Wake lock and visibility                                                     */
/* --------------------------------------------------------------------------- */

let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !document.hidden) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => (wakeLock = null));
    }
  } catch {
    /* not critical */
  }
}

document.addEventListener("visibilitychange", async () => {
  if (!running) return;
  if (document.hidden) {
    hiddenSince = Date.now();
    return;
  }
  await keepAwake();
  if (hiddenSince) {
    est.reset();
    hold.reset();
    ui.guide.textContent = "The page was in the background: measuring again. Keep this page open.";
    hiddenSince = 0;
    // Chrome can drop the torch while the tab is hidden.
    if (torchOn || hasTorch(track)) {
      const ok = await setTorch(true);
      setStatus(ui.flash, ok ? "on" : "could not switch on", ok ? "ok" : "warn");
    }
  }
});

/* --------------------------------------------------------------------------- */
/* Start / stop                                                                 */
/* --------------------------------------------------------------------------- */

let tickTimer = 0;

async function start() {
  ui.start.disabled = true;
  setStatus(ui.camera, "asking permission...");
  try {
    const cam = await openCamera();
    stream = cam.stream;
    track = cam.track;
    ui.video.srcObject = stream;
    await ui.video.play().catch(() => {});
    const label = track.label ? ` (${track.label.slice(0, 28)})` : "";
    setStatus(ui.camera, `on${label}`, "ok");
    if (cam.torch) {
      // Some Chrome versions need the track to be playing first.
      let ok = await setTorch(true);
      if (!ok) {
        await new Promise((r) => setTimeout(r, 500));
        ok = await setTorch(true);
      }
      setStatus(ui.flash, ok ? "on" : "could not switch on", ok ? "ok" : "warn");
    } else {
      noTorch = true;
      setStatus(ui.flash, "No flashlight control: shine a lamp or a second phone's flashlight onto the back of your fingertip.", "warn");
    }
    noTorch = !cam.torch;
    minRed = noTorch ? MIN_RED_NO_TORCH : MIN_RED_TORCH;
    est = createPpgEstimator({ fingerRatio: FINGER_RATIO, minRed });
    hold.reset();
    maskFrozen = false;
    running = true;
    scheduleFrame();
    tickTimer = setInterval(tick, 1000);
    await keepAwake();
    ui.start.textContent = "Stop";
    ui.start.classList.add("stop");
    ui.guide.textContent = noTorch
      ? "Rest a fingertip lightly on the main lens, light behind it, keep still."
      : "Cover the camera and flash with a fingertip. Rest it lightly, keep still.";
  } catch (err) {
    const msg =
      err?.name === "NotAllowedError"
        ? "Camera permission denied: tap the icon left of the address, allow Camera, then reload."
        : err?.name === "NotReadableError"
          ? "Camera busy: close other camera apps and try again."
          : `Camera error: ${err?.message ?? err}`;
    setStatus(ui.camera, msg, "bad");
    ui.guide.textContent = msg;
    stopStream(stream);
    stream = null;
    track = null;
  } finally {
    ui.start.disabled = false;
  }
}

async function stop() {
  running = false;
  clearInterval(tickTimer);
  if ("cancelVideoFrameCallback" in HTMLVideoElement.prototype) ui.video.cancelVideoFrameCallback(frameHandle);
  cancelAnimationFrame(frameHandle);
  await setTorch(false);
  stopStream(stream);
  stream = null;
  track = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  est.reset();
  hold.reset();
  setBeat(null);
  ui.bpm.textContent = "--";
  ui.heart.classList.remove("live");
  ui.qbar.style.width = "0";
  drawWave([]);
  setStatus(ui.camera, "off");
  setStatus(ui.flash, "off");
  setStatus(ui.finger, "-");
  ui.guide.textContent = "Stopped. Tap Start to measure again.";
  ui.guide.className = "guide";
  ui.start.textContent = "Start";
  ui.start.classList.remove("stop");
}

ui.start.addEventListener("click", () => (running ? stop() : start()));
drawWave([]);

// For the automated end-to-end test only (read-only view of the last poll).
window.__pulse = { get last() { return lastOut; } };
