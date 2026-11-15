"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Flashlight, HeartPulse, Send, TriangleAlert } from "lucide-react";
import { PULSE_MIN_WINDOW_S, PulseTracker, looksLikeFinger, type PulseEstimate } from "@/lib/pulse/estimator";

/** How often the estimate is recomputed and, when good, sent to Demify. */
const SEND_EVERY_MS = 1000;
/** Side of the square sampled from the centre of each frame (video pixels). */
const SAMPLE_SIZE = 64;

type Phase = "idle" | "starting" | "running" | "error";

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hasTorch(track: MediaStreamTrack): boolean {
  const caps = (track.getCapabilities?.() ?? {}) as TorchCapabilities;
  return caps.torch === true;
}

/**
 * Switches the torch on or off. Always tries (Chrome on Android sometimes
 * reports the torch capability only once the track streams), up to three
 * times, and reports success only when the track says the torch is set or at
 * least offers one (Chrome silently ignores an unsupported advanced constraint).
 */
async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (track.readyState !== "live") return false;
    let failed = false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    } catch {
      failed = true;
    }
    const setting = (track.getSettings() as MediaTrackSettings & { torch?: boolean }).torch;
    if (setting === on) return true;
    if (!failed && setting === undefined && hasTorch(track)) return true;
    await sleep(400);
  }
  return false;
}

const VIDEO: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 30 },
};

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

async function openDefaultBack(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { ...VIDEO, facingMode: { ideal: "environment" } },
    audio: false,
  });
}

async function playOn(video: HTMLVideoElement, stream: MediaStream) {
  video.srcObject = stream;
  await video.play();
}

/**
 * Opens a back camera with the torch on: first the default back camera; when
 * its torch does not switch on, the other back lenses one by one (phones with
 * several back lenses often have the flash only next to the main one). Without
 * any torch it ends on the default back camera (then a bright lamp helps).
 * `alive()` false = the user stopped or left meanwhile: everything opened is
 * closed and null returned.
 */
async function openBackCameraWithTorch(
  video: HTMLVideoElement,
  alive: () => boolean,
): Promise<{ stream: MediaStream; torch: boolean } | null> {
  let stream = await openDefaultBack();
  if (!alive()) return stopStream(stream), null;
  await playOn(video, stream);
  if (await setTorch(stream.getVideoTracks()[0], true)) return { stream, torch: true };
  if (!alive()) return stopStream(stream), null;

  // Labels are readable now that permission is granted.
  const firstId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const others = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== firstId)
    .filter((d) => !/front|user|vorder|selfie/i.test(d.label))
    .slice(0, 4);
  if (others.length === 0) return { stream, torch: false };

  for (const d of others) {
    stopStream(stream);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...VIDEO, deviceId: { exact: d.deviceId } }, audio: false });
    } catch {
      continue;
    }
    if (!alive()) return stopStream(stream), null;
    try {
      await playOn(video, stream);
      if (await setTorch(stream.getVideoTracks()[0], true)) return { stream, torch: true };
    } catch {
      // try the next lens
    }
    if (!alive()) return stopStream(stream), null;
  }
  // No lens with a torch: back to the default back camera.
  stopStream(stream);
  stream = await openDefaultBack();
  if (!alive()) return stopStream(stream), null;
  await playOn(video, stream);
  return { stream, torch: false };
}

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

function drawWave(canvas: HTMLCanvasElement | null, wave: number[]) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (wave.length < 2) return;
  const max = Math.max(...wave.map(Math.abs)) || 1;
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  wave.forEach((v, i) => {
    const x = (i / (wave.length - 1)) * w;
    // Camera brightness falls when blood volume rises: invert, so beats point up.
    const y = h / 2 + ((v / max) * h) / 2.4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/**
 * Phone page of the camera pulse demo: camera + torch, the pulse estimated on
 * the phone (src/lib/pulse/estimator.ts), one reading per second posted to
 * Demify's device API for the sensor-only test crew member.
 */
export function PulseCapture({ crewId, crewName }: { crewId: string; crewName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const trackerRef = useRef(new PulseTracker());
  const fingerRef = useRef(false);
  /** Incremented by every stop (and unmount): a start that finds a newer run id gives up. */
  const runRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorchState] = useState<boolean | null>(null);
  const [finger, setFinger] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [estimate, setEstimate] = useState<PulseEstimate | null>(null);
  const [sent, setSent] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [secure, setSecure] = useState(true);
  // The Start button works only after hydration; until then it shows "Loading…".
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Read after hydration: the server cannot know how the phone reached us.
    const id = window.setTimeout(() => {
      setSecure(window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const stop = useCallback(() => {
    runRef.current++;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    trackerRef.current.reset();
    setEstimate(null);
    setFinger(false);
    setSeconds(0);
    setTorchState(null);
    setPhase("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const send = useCallback(
    async (bpm: number) => {
      try {
        const res = await fetch("/api/readings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            {
              crewId,
              indicator: "heartRate",
              value: Math.round(bpm),
              unit: "bpm",
              takenAt: new Date().toISOString(),
              source: "sensor",
              note: "Phone camera pulse estimate (demo)",
            },
          ]),
        });
        if (res.ok) {
          setSent((n) => n + 1);
          setSendError(null);
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setSendError(`${res.status}: ${body.error ?? res.statusText}`);
        }
      } catch {
        setSendError("Demify not reachable");
      }
    },
    [crewId],
  );

  const requestWakeLock = useCallback(async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
        .wakeLock;
      wakeRef.current = (await wl?.request("screen")) ?? null;
    } catch {
      // Screen may dim; the demo still works while the page stays open.
    }
  }, []);

  // The wake lock ends when the phone switches apps; take it again on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && streamRef.current) void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  const retryTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) setTorchState(await setTorch(track, true));
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setSendError(null);
    setPhase("starting");
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    try {
      const video = videoRef.current!;
      const opened = await openBackCameraWithTorch(video, alive);
      if (!opened) return;
      streamRef.current = opened.stream;
      setTorchState(opened.torch);
      await requestWakeLock();
      if (!alive()) return;

      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tracker = trackerRef.current;
      tracker.reset();

      // One sample per camera frame where the browser can tell us (Chrome:
      // requestVideoFrameCallback), otherwise per display frame.
      const v = video as FrameVideo;
      const next = (cb: () => void) => {
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(cb);
        else rafRef.current = requestAnimationFrame(cb);
      };
      const frame = () => {
        if (!alive()) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const side = Math.min(video.videoWidth, video.videoHeight) / 2;
          const sx = (video.videoWidth - side) / 2;
          const sy = (video.videoHeight - side) / 2;
          ctx.drawImage(video, sx, sy, side, side, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          const px = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
          let r = 0;
          let g = 0;
          for (let i = 0; i < px.length; i += 4) {
            r += px[i];
            g += px[i + 1];
          }
          const n = px.length / 4;
          const red = r / n;
          const green = g / n;
          fingerRef.current = looksLikeFinger(red, green);
          tracker.add({ t: performance.now(), red, green });
        }
        next(frame);
      };
      next(frame);

      timerRef.current = window.setInterval(() => {
        const e = tracker.estimate();
        setFinger(fingerRef.current);
        setSeconds(tracker.seconds);
        setEstimate(e);
        drawWave(waveRef.current, tracker.waveform());
        if (e) void send(e.bpm);
      }, SEND_EVERY_MS);
      setPhase("running");
    } catch (err) {
      if (!alive()) return;
      stop();
      const name = (err as { name?: string })?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow the camera for this site in the browser settings and try again."
          : name === "NotFoundError"
            ? "No camera found."
            : `Camera could not start (${name ?? "error"}).`,
      );
      setPhase("error");
    }
  }, [requestWakeLock, send, stop]);

  const running = phase === "running";
  const bpm = estimate ? Math.round(estimate.bpm) : null;
  const status = !running
    ? null
    : !finger
      ? "Place a fingertip gently over the main camera and the flash."
      : !estimate
        ? seconds < PULSE_MIN_WINDOW_S
          ? `Hold still… ${Math.max(0, Math.ceil(PULSE_MIN_WINDOW_S - seconds))} s`
          : "Searching for a steady pulse. Press lightly and keep still."
        : "Pulse found. Sending to Demify once per second.";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <header className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Demify · phone pulse demo</p>
        <h1 className="text-2xl font-semibold tracking-tight">Camera pulse for {crewName}</h1>
        <p className="text-sm text-muted">
          This is a camera pulse estimate, not a medical measurement. Values go to the training monitor of {crewName}.
        </p>
      </header>

      {!secure && (
        <div className="flex gap-2 rounded-lg border border-caution/50 bg-caution/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            The camera needs HTTPS. Open this page through the HTTPS address shown on the laptop (port 8443, from{" "}
            <code>npm run pulse:https</code>), not through http://.
          </p>
        </div>
      )}

      <div className="flex flex-col items-center rounded-2xl border border-border bg-surface p-6 text-center">
        <HeartPulse className={`size-8 ${bpm ? "animate-pulse text-critical" : "text-muted"}`} aria-hidden />
        <p className="mt-2 font-mono text-7xl font-semibold tabular-nums" aria-live="polite">
          {bpm ?? "--"}
        </p>
        <p className="text-sm text-muted">bpm (camera estimate)</p>
        <canvas ref={waveRef} width={320} height={80} className="mt-4 h-20 w-full" aria-hidden />
        {running && <p className="mt-3 min-h-10 text-sm">{status}</p>}
        {estimate && (
          <p className="mt-1 font-mono text-[11px] text-muted">
            signal quality {Math.round(estimate.quality * 100)} % · window {estimate.windowS.toFixed(0)} s
          </p>
        )}
      </div>

      {!running ? (
        <button
          type="button"
          onClick={start}
          disabled={!ready || phase === "starting"}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-fg px-5 py-4 text-lg font-semibold text-bg disabled:opacity-60"
        >
          <Camera className="size-5" aria-hidden />
          {!ready ? "Loading…" : phase === "starting" ? "Starting camera…" : "Start"}
        </button>
      ) : (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-4 text-lg font-semibold"
        >
          <CircleStop className="size-5" aria-hidden />
          Stop
        </button>
      )}

      {error && <p className="rounded-lg border border-critical/50 bg-critical/10 p-3 text-sm">{error}</p>}

      <ul className="space-y-1.5 font-mono text-[12px] text-muted">
        <li className="flex items-center gap-2">
          <Flashlight className="size-3.5" aria-hidden />
          torch:{" "}
          {torch === null ? "–" : torch ? "on" : "did not switch on"}
          {running && torch === false && (
            <button
              type="button"
              onClick={retryTorch}
              className="ml-1 rounded-md px-2 py-0.5 text-fg ring-1 ring-inset ring-border"
            >
              Try torch again
            </button>
          )}
        </li>
        {running && torch === false && (
          <li className="pl-5">No flash on this camera: hold the finger in front of a bright lamp instead.</li>
        )}
        <li className="flex items-center gap-2">
          <Send className="size-3.5" aria-hidden />
          readings sent: {sent}
          {sendError && <span className="text-critical"> · last error {sendError}</span>}
        </li>
      </ul>

      {/* The camera preview stays tiny: it is only sampled, the finger covers it anyway. */}
      <video ref={videoRef} playsInline muted className="h-16 w-16 rounded-md border border-border object-cover" />
    </div>
  );
}
