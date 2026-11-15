# Demify pulse demo: setup progress

Resume rule: read this file first, continue at the first step that is not DONE.
Never `git push`. Do not edit or commit in the Demify repository.

| Step | Status | Evidence | Next action |
|---|---|---|---|
| 1 Inventory | DONE | see below | - |
| 2 Demify on :3000 | DONE | `npm ci` ok; `/api/health` ok; `/api/vitals/live?crewId=cdr` hr 60 `simulated` before the demo | - |
| 3 Docker Desktop | DONE (already installed) | Docker Desktop 4.99.0, engine 29.9.3, `hello-world` ok. No restart needed | - |
| 4 Mosquitto | DONE | `demify-mosquitto` (eclipse-mosquitto:2.0.22), "Opening ipv4 listen socket on port 1883", port `127.0.0.1:1883` only, pub/sub round trip ok | - |
| 5 Pulse package | DONE | all files written; local git repo, no remote | - |
| 6 Tests | DONE | `npm test` 115/115; fake-phone chain ok; e2e 72 and 110 bpm PASS; drills ok (below) | - |
| 7 Network/firewall | DONE (iPhone 16 Pro Max hotspot; S24 FE not available tonight) | laptop 172.20.10.4 on iPhone hotspot, profile Private, rule 8443 Private. ROOT CAUSE of timeouts: Portmaster (Safing) blocked inbound for node.exe (log: `dropped: inbound connections blocked`); fixed by the human: Portmaster > Node.js > Block Inbound Connections OFF. iPhone then connected | - |
| 8 Real phone test | IN PROGRESS (iPhone) | page reachable from iPhone Safari; real signal often only "yellow" -> demo hold added (2026-11-15) | finger test with the hold |
| 9 Stage readiness | MOSTLY DONE | STAGE_CHECKLIST.md written; prod server tested on :3100 | decide dev vs prod with the human; cold-start run-through |

## Step 1 inventory (2026-11-14 evening)

- Laptop: HP EliteBook X Flip G1i 14", Windows 11 Pro 10.0.26200
- Virtualisation: hypervisor running (VBS on), WSL 2 installed (Debian default; `docker-desktop` distro present)
- node v24.19.0, npm 11.17.0, git 2.51.0.windows.1, winget v1.29.380
- Docker: installed per user at `C:\Users\duesi\AppData\Local\Programs\DockerDesktop\resources\bin` (on the user PATH;
  scripts add it themselves if missing)
- Demify repo: `C:\Repos\NSAC\Demify---Health-Monitoring-Software-for-Astronauts`, branch `Project-2-Phase-1`,
  clean, fast-forwarded f6e3f0b -> e3e7589. Still clean after all tests (readings go to ignored `data/demify-db.json`)
- Demify `.env` / `.env.local`: none, `DEMIFY_ADMIN_TOKEN` not set -> write API needs no token
- Network adapters: WLAN 10.220.8.135 (real), Tailscale 100.95.x, WSL vEthernet 192.168.80.1, VMware 192.168.230.1/217.1

## Step 5/6 evidence

- Deps pinned: mqtt 5.16.1, selfsigned 5.5.0 (async generate), playwright 1.65.1 (+ Chromium)
- Estimator (synthetic tests): clean signals error within ±1 bpm (bar ±3) at 15/24/30/60 fps x 48..175 bpm;
  noisy within ±5; harmonic guard ok; finger lift recovery < 10 s; 70 -> 110 bpm followed within 10 s.
  Publish rule tuned by sweep (`tools/sweep.mjs`): quality >= 0.5 (spec value) + 3 consecutive agreeing estimates
  -> 0 false publishes in 320 pure-noise runs, 0 wrong values in 84 signal cases, 96 % coverage.
  Known limit (documented in the test): 0.3 % amplitude at 175 bpm with 15-24 fps is not resolved -> shows `--`.
  Bars NOT loosened; only my own extra coverage requirement is skipped in that corner.
- Smoke test: fake phone 88 bpm -> Demify `hr 88, source mixed` within ~1 s.
- e2e (Playwright Chromium, fake camera Y4M, real phone page): 72 bpm -> page 72, Demify 72 mixed;
  110 bpm -> page 110, Demify 110 mixed. First value ~9.4 s after Start; Demify 30-80 ms after the page.
  Screenshots: `test/out/phone-72.png`, `phone-110.png`, `demify-crew-cdr.png` (Demify monitor HR 77 "DEVICE + SIMULATED").
- Gateway security: no token -> 403 page; POST without token -> 401; crewId `cdr/#` -> 400; body > 2 KB -> 413;
  path traversal blocked; CSP, no-store, no-referrer headers.
- Drill: broker stopped 10 s -> gateway answers "broker down" (503), both reconnect ~1 s after restart, data flows.
- Drill: Demify killed -> bridge logs once "ECONNREFUSED hint: is Demify running", recovers alone after restart.
- Drill: wrong admin token -> not applicable (Demify has none); 401 hint covered by unit test.
- Drill: page without token -> 403 "Token needed" page.
- start-demo.ps1 / stop-demo.ps1 tested end to end (PS 5.1 stderr pitfall found and fixed).

## Decisions

- Docker needed no install/restart, so steps 3-4 finished in the first session.
- Period search runs on the band-passed signal upsampled 2x (60 Hz) for lag resolution; filtering stays at 30 Hz.
- Peak minimum distance is 0.6 x the period (0.33 s when no period yet), so 175 bpm beats are not merged.
- start-demo.ps1 starts Docker Desktop itself and opens Demify in a new window if it is not running (reversible).
- stop-demo.ps1 kills only processes it owns (PID file + full-path match).
- Production option: `start-demify-prod.ps1` (standalone server, `DEMIFY_DATA_DIR` = repo `data`, no Demify changes).
  Build done (`npm run build`, output in ignored `.next/`). Tested on :3100: health ok, readings ok, /crew/cdr 0.4 s.
- Mistake + fix: while stopping the :3100 test server I also stopped the Demify dev server (pattern too broad);
  restarted it immediately, verified 200.

- Debug log step 7: Windows Firewall off -> still blocked; WFP netevents empty; pktmon showed the iPhone SYNs arriving at the
  Wi-Fi NIC with no reply; parallel investigators found Portmaster's kernel driver (PortmasterKext) dropping all inbound.

## 2026-11-15 early morning: iPhone as stage phone, polish

- Stage phone switched to the iPhone 16 Pro Max (Safari, Personal Hotspot). S24 FE: its requests never reached the laptop
  (packet capture: only DNS replies from the phone); cause on the phone side, not solved.
- Phone page: Demify light design (tokens from Demify globals.css, IBM Plex bundled), tile-based finger finder with live
  grid, forgiving placement (no restart on shifts / short slips), glare tiles ignored, iPhone no-flash hints.
- Gateway renews its certificate automatically on network change. start/stop scripts: no WMI, time-limited docker.
- Final checks: npm test 117/117; e2e 72, 110 (full lens) and 90 (partial lens) PASS, page and Demify agree.
- Laptop state at the end: PowerShell itself stopped starting (hung Windows service, 62 h uptime): restart before the pitch.
