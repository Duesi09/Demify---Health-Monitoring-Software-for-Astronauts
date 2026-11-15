# Stage checklist: live camera pulse in Demify (iPhone)

Pitch: Sunday 15 Nov 2026, about 16:00-17:00 CET.
Phone: **iPhone 16 Pro Max**, **Safari**, its **Personal Hotspot** is the network. Laptop: this HP EliteBook.
All commands run in PowerShell in `C:\Users\duesi\demify-pulse`.

## Setup facts

- Demify runs from git branch **`presentation`**. The monitor for the demo is **http://localhost:3000/crew/test**
  ("Test Crew (phone)"): `--` / NO SIGNAL until the iPhone sends, then only the measured heart rate (`DEVICE`).
  About 3 s after the finger is lifted it goes back to `--`. Everyone else stays simulated.
- On the iPhone hotspot the laptop gets **172.20.10.x** (tonight: 172.20.10.4). Phone link:
  `https://172.20.10.4:8443/?token=<PULSE_TOKEN from .env>&crew=test` (the `>>` line of `start-demo.ps1` shows the exact one).
- **Light:** Safari may not switch the iPhone flash on (the page says "No flashlight control"). Then the fingertip needs
  bright light from behind: a desk lamp, or a second phone's flashlight shining onto the back of the fingertip.
  Prepare that light source and test it.
- **Portmaster** (firewall on this laptop) must allow inbound for Node.js (set tonight; see below if it stops working).
- **Demo hold (on by default):** as soon as the phone sees a rough pulse (2 agreeing rough readings, even while the bar is
  yellow; at the latest after ~9 s with the finger on) it locks that value and keeps it going with a small natural drift
  (about +/-5 bpm). A real, clean measurement pulls the value along. Lifting the finger: the iPhone keeps the number 2 s, the laptop shows `--` about 3 s after lifting.
  Strict mode without the hold: add `&hold=0` to the link.
- The laptop is short on memory: close Discord, extra browser tabs and other heavy apps before the demo.

## The night before / morning

- [ ] **Restart the laptop in the morning** (it ran 62 h without a restart; Windows services such as PowerShell/WMI hung that night).
- [ ] Charge the iPhone and the laptop to 100 %. Pack the laptop charger and the light source.
- [ ] iPhone: Settings > **Personal Hotspot** > **Allow Others to Join** on (and **Maximize Compatibility** on).
- [ ] Laptop joins "Andri Köb's iphone". The network is already marked Private (done tonight). If `start-demo.ps1`
      warns "not Private": `powershell -ExecutionPolicy Bypass -File network-setup.ps1` (click **Yes**).
- [ ] One full test run (list below) with a real finger and the light source.
- [ ] Safari: add the phone link as a bookmark (or to the Home Screen) as "Demify pulse".

## 30 minutes before

1. [ ] iPhone hotspot on, laptop joined to it, laptop plugged in. Close Discord and extra browser tabs.
2. [ ] Docker Desktop running (whale icon; `start-demo.ps1` also starts it).
3. [ ] Demify in its own window: `cd C:\Repos\NSAC\Demify---Health-Monitoring-Software-for-Astronauts`, `git switch presentation`, `npm run dev`.
4. [ ] `powershell -ExecutionPolicy Bypass -File start-demo.ps1` in this folder. All lines `OK`; the phone link is in the `>>` line.
5. [ ] Laptop browser: **http://localhost:3000/crew/test**, zoom 125-150 % (Ctrl +). Shows `--` / NO SIGNAL.
6. [ ] iPhone Safari: open the bookmark. Certificate warning (normal, our own certificate; again after the laptop IP changed):
       **Show Details > visit this website > Visit Website**.
7. [ ] Tap **Start**, allow the camera. Note the **Flash** line: "on", or "No flashlight control" (then use the light source).
8. [ ] Test finger: the iPhone counts down, then shows the number; the laptop shows the same about 1-3 s later (tag `DEVICE`).
       Lift the finger: about 3 s later the laptop is back to `--`.
9. [ ] Tap **Stop**. Keep Safari open on the page.
10. [ ] iPhone: brightness up, **Focus / Do Not Disturb** on, **Low Power Mode off**, Settings > Display > **Auto-Lock: Never**
       (the page also keeps the screen on, this is a backup).
11. [ ] **No drill running** in Demify for Test Crew.

## On stage

- One team member runs the laptop; the other hands the iPhone to a volunteer, holds the light source and helps.
- Say: **"This is a camera pulse estimate, smoothed for the demo, not a medical measurement."**
  (Demify is a research prototype, not a certified medical device.)
- Tap **Start**. The volunteer rests a fingertip **lightly** over the **main lens** (the big one top-left of the three) and,
  if the flash works, the flash too. Elbow on the table, keep still for 10-15 s. No flash: shine the light onto the back of the fingertip.
- After about 5 s the iPhone shows the number (demo hold) and the heart beats at that rate; `/crew/test` on the laptop shows the same and follows it.
- "Weak signal": lighter touch, more light, warmer finger, keep still. Cold or shaky hands: let a teammate do it.
- Afterwards tap **Stop**.

## Plan B (no number within ~30 s)

1. Laptop, second PowerShell window in this folder: `npm run fake-phone`
2. **Say clearly on stage: "These are simulated values for this demo."**
3. Or skip to the next part. Ctrl+C stops the fake phone; `/crew/test` goes back to `--` after about 3 s.

## Stop everything

1. iPhone: **Stop**, then Personal Hotspot off.
2. Laptop: Ctrl+C in the `start-demo.ps1` window, then `powershell -ExecutionPolicy Bypass -File stop-demo.ps1`.
3. Demify keeps running in its own window (Ctrl+C there to stop it).

## Good to know

- Only heart rate comes from the phone; on Test Crew the other vitals show `--` (never simulated).
- A running drill always uses the simulator, even while the phone sends.
- The page must stay in the foreground; switching apps pauses sending (it measures again on return).
- Pressing hard squeezes the blood out of the fingertip: the signal disappears. Light touch.
- Samsung S24 FE as phone: its requests never reached the laptop tonight (cause on the phone, probably its Wi-Fi/VPN).
  Not used for the pitch unless that is solved.

## If something breaks

| Problem | Do this |
|---|---|
| iPhone: page times out / "server stopped responding" | 1) Laptop really on the iPhone hotspot (172.20.10.x)? 2) Is the gateway window still running? Restart `start-demo.ps1`. 3) **Portmaster**: Apps > Node.js > Network Scope > Block Inbound Connections **OFF** (its log in `C:\ProgramData\Portmaster\logs` shows `node.exe <- ... dropped: inbound connections blocked` when it blocks) |
| iPhone: "Token needed" | Use the full link from the `>>` line (it contains `?token=`) |
| Certificate warning again | Normal after the laptop got a new IP: Show Details > visit this website |
| "No flashlight control" | Expected on iPhone Safari: shine a lamp / second phone's flashlight onto the back of the fingertip |
| Camera does not start | Settings > Safari > Camera > Allow; reload; close the Camera app |
| `/crew/test` stays `--` | Link has `crew=test`? `npm run check` in a second window; look at the `[bridge]` lines in the start window |
| `start-demo.ps1`: Docker not running | Start Docker Desktop, wait for "Engine running", run it again |
| Things crash or are slow | Low memory: close Discord and browser tabs |
| PowerShell window does not open / hangs | Restart the laptop. Fallback without PowerShell: open **cmd**, `cd C:Usersduesidemify-pulse`, `node start.mjs` (broker must already run in Docker) |
| Laptop joined another network | Nothing to restart: the gateway notices within ~10 s, makes a new certificate and prints the **new** `>>` link in its window; open that link and accept the warning again |
