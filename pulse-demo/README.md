# Demify pulse (phone camera → MQTT → Demify)

A fingertip on the phone's rear camera (flash on) gives a **camera pulse
estimate for a demo, not a medical measurement**. The phone page sends it to
this laptop, which publishes it over MQTT; a bridge forwards it to Demify (a
research prototype, not a certified medical device), whose live monitor shows
it within about a second.

```
Phone (Chrome page: camera + flash + pulse maths)
  │ HTTPS POST /api/pulse, ~1 per second (phone hotspot)
  ▼
gateway.mjs  (HTTPS :8443, serves the page, self-signed certificate)
  │ MQTT publish demify/crew/cdr/vitals
  ▼
Mosquitto in Docker (127.0.0.1:1883 only)
  │ MQTT subscribe demify/crew/+/vitals
  ▼
bridge.mjs ── POST http://127.0.0.1:3000/api/readings ──► Demify /crew/cdr
```

## One click (any Windows laptop)

1. Get the repo: `git clone` it (or download the ZIP), branch **OG-Presentation**.
2. Double-click **`pulse-demoSTART-DEMO.cmd`**.

It installs Node.js if missing (winget; then double-click again), installs the
packages, creates `.env` with a fresh phone token, starts Demify in its own
window, opens the monitor `/crew/test` in the browser, and starts the phone
part with a **built-in MQTT broker** (Docker is not needed; a running
Mosquitto on 1883 is used instead if there is one). The window prints the
phone link and a **QR code**: put laptop and phone on the same network (best
the phone's hotspot) and scan it. If Windows asks whether Node.js may use the
network: Private, Allow. Firewalls such as Portmaster must allow inbound
connections for Node.js. Stop: close the window.

## Everyday use

```powershell
powershell -ExecutionPolicy Bypass -File start-demo.ps1   # broker, checks, gateway + bridge
powershell -ExecutionPolicy Bypass -File stop-demo.ps1    # stop gateway, bridge, broker
```

`start-demo.ps1` starts Docker Desktop if needed, starts the broker, checks
Demify (opens it in a new window if it is not running), warns about a running
drill or a Public network, then prints the phone link (line with `>>`).
On stage, follow **STAGE_CHECKLIST.md**.

Both scripts avoid WMI (it can hang on a busy laptop) and time-limit every
docker call, so they never freeze. When the laptop changes network, the
gateway renews its certificate by itself within ~10 s and prints the new
phone link (no restart needed).

## npm scripts

| Script | What it does |
|---|---|
| `npm start` | gateway + bridge together (logs prefixed, crash restart, Ctrl+C stops both) |
| `npm run gateway` / `npm run bridge` | one of them alone |
| `npm run broker` / `npm run broker:stop` | Mosquitto container up / down |
| `npm run fake-phone` | **simulated** pulse posts (72 → 95 → 72 bpm) without a phone; `-- --bpm 80` for a constant rate |
| `npm run check` | prints Demify's live `hr` and `source` every second |
| `npm test` | estimator accuracy + contract unit tests |
| `npm run test:e2e` | Chromium with a fake camera video (72 and 110 bpm) through the whole chain; needs broker, Demify and `npm start` running |

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DEMIFY_URL` | `http://127.0.0.1:3000` | where the bridge posts readings |
| `DEMIFY_ADMIN_TOKEN` | empty | only if Demify runs with a token (sent as `x-demify-admin`) |
| `MQTT_URL` | `mqtt://127.0.0.1:1883` | broker |
| `PORT` | `8443` | HTTPS port for the phone |
| `PULSE_TOKEN` | random | the phone link carries it as `?token=`; without it the page answers 403 |
| `CREW_ID` | `cdr` | default crew member |
| `HTTP_PORT` | empty | optional plain-HTTP port, only for the fallback below |
| `DEMIFY_DIR` | Demify repo path | used by `start-demo.ps1` to start Demify |

## How the estimate works (public/ppg.js)

Mean red/green/blue of the centre of each frame → finger check (red ≫ green,
blue; bright, not clipped) → exposure steps stitched, big jumps reset →
resample red to 30 Hz → invert, detrend (1.5 s) → 0.7–3.5 Hz Butterworth
band-pass → autocorrelation over the last 8 s (with a guard against picking
2× or 3× the period) cross-checked with a beat count → published only after
≥ 6 s of good signal, quality ≥ 0.5 and 3 agreeing estimates in a row; the
value is the median of the last 5.

Test results (synthetic signals, `npm test`): clean signals within ±1 bpm
(bar ±3) at 15/24/30/60 fps and 48–175 bpm; noisy signals within the ±5 bar;
**0 false publishes in 320 pure-noise runs**. Known limit: an extremely weak
pulse (0.3 % amplitude) at 175 bpm with only 15–24 fps is not resolved: the
page then shows `--` instead of a number.

### Demo hold (public/hold.js)

For the stage the page does not wait for the strict publish rule above. Once
two rough estimates agree within 15 % (quality >= 0.15, after 3 s of finger
signal; fallback: median of all rough estimates after 9 s) it locks that
value, clamped to 55-110 bpm, and sends it with a small mean-reverting drift
(about +/-5 bpm). Strict estimates, when they come, pull the value along.
Finger off: sending stops at once, the phone keeps the number 2 s. `&hold=0` in the link turns it off. The
held value is a smoothed demo value, not a measurement. `HOLD=1 npm run test:e2e`
tests the page with the hold.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Phone: "Your connection is not private" | Expected (self-signed). Chrome: Advanced → Proceed. Safari: Show Details → visit this website. Again after the laptop IP changes |
| Phone: "Token needed" (403) | Use the full link printed by the gateway (with `?token=`) |
| Phone: "laptop not reachable" | Laptop on the phone hotspot? Network profile Private? Firewall rule for 8443 (STAGE_CHECKLIST.md) |
| Flash does not turn on | Use Chrome (not Samsung Internet); Stop → Start; close the camera app |
| Page stuck at "weak signal" | Lighter touch, warm finger, cover lens and flash together, keep still |
| "saturated" | Finger rests too hard or does not cover the flash: rest it lightly over both |
| Demify stays "simulated" | Drill running? (sensor data ignored during drills.) `npm run check`; bridge log shows the Demify answer |
| Bridge: 401 | Demify has `DEMIFY_ADMIN_TOKEN`: put the same value into `.env` |
| `start-demo.ps1`: Docker not running | Start Docker Desktop, wait for "Engine running" |

**Fallback if HTTPS on the phone fails:** set `HTTP_PORT=8080` in `.env`,
restart, then on the phone open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
add `http://<laptop-IP>:8080`, relaunch Chrome, open
`http://<laptop-IP>:8080/?token=…&crew=test`. Also allow port 8080 in the firewall (Private).

## Files

`public/` phone page (`ppg.js` estimator, `app.js`, `index.html`, `style.css`) ·
`gateway.mjs` · `bridge.mjs` · `start.mjs` · `lib/contract.mjs` (message
formats, shared with tests) · `tools/` (fake phone, Demify check, diagnostics) ·
`test/` · `mosquitto/mosquitto.conf` + `docker-compose.broker.yml` ·
`SETUP_PROGRESS.md` (setup log).
