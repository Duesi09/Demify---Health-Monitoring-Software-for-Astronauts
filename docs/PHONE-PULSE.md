# Phone pulse demo

A phone measures a **camera pulse estimate** (fingertip over the main camera
and the flash) and sends it once per second to the monitor of the test crew
member "Test Crew (phone)" (`/crew/test`). This crew member is never
simulated: without a phone signal the monitor shows `--` / no signal.

This is a camera pulse estimate, not a medical measurement. It is a
training demo.

Everything runs inside Demify. No MQTT broker, no gateway package.

```
phone (Chrome)  --https:8443-->  scripts/pulse-https.mjs  --http-->  Demify :3000
  /pulse page: camera + torch,                 (self-signed TLS,        POST /api/readings
  pulse estimated on the phone                  same origin)            -> /crew/test
```

## Steps

1. **Same network.** Switch on the phone's hotspot and connect the laptop to
   it. No VPN on the phone.
2. **Start Demify** on the laptop, either as the container
   (`docker compose up -d --build`) or with `npm run build` then `npm start`.
   Check http://localhost:3000/crew/test shows `--`.
3. **Start the HTTPS access** in a second terminal, in the Demify folder
   (once before: `npm ci`; on Windows PowerShell use `npm.cmd`):

   ```bash
   npm run pulse:https
   ```

   It prints the phone link (`https://<laptop-ip>:8443/pulse?crew=test`) and a
   QR code. Windows asks about the firewall: tick **both Private and
   Public** networks and allow (a newly joined phone hotspot is usually a
   "Public" network in Windows). If you once clicked "Cancel", Windows keeps
   a block rule for Node.js: remove it under Windows Defender Firewall ->
   Allow an app. With Portmaster or another firewall, allow inbound
   connections for Node.js.
   **Test this once from the phone before the pitch.**
4. **On the laptop** open http://localhost:3000/pulse/connect for a large QR
   code (or scan the one in the terminal).
5. **On the phone** scan the QR code and open it in **Chrome**. "Your
   connection is not private": tap **Advanced**, then **Proceed** (our own
   self-signed certificate, created in `.pulse-cert/`).
6. Tap **Start**, allow the camera. The flash switches on. Place a fingertip
   **gently** over the main camera and the flash and keep still. After about
   6 to 10 s the pulse appears on the phone and on `/crew/test`.
   Lifting the finger stops the readings; the monitor goes back to no signal
   after about 8 s.

## How the estimate works

`src/lib/pulse/estimator.ts`: mean red and green brightness of a centre
square of each frame, resampled to 30 Hz, drift removed and smoothed, then a
normalised autocorrelation between 40 and 180 bpm over the last 10 s. The
height of the autocorrelation peak is the signal quality; below 0.5 nothing is
shown or sent. With a strong torch the red channel is often clipped at 255;
then the green channel is used. The shown value is the median of the last
five estimates. Tests with synthetic pulse signals: `tests/pulse-estimator.test.ts`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone cannot open the page (timeout) | Laptop really in **this** phone's hotspot? Firewall allows Node.js inbound on **Public** networks too (Windows, Portmaster)? Old block rule for Node.js? |
| Flash stays off | Tap "Try torch again". Close other apps that use the camera. Otherwise a bright lamp behind the finger. |
| "The camera needs HTTPS" | Open the `https://…:8443` link, not `http://…:3000`. |
| `--` stays, "Searching for a steady pulse" | Press lighter (pressing hard stops the blood flow), keep the hand still, cover camera and flash completely. |
| Readings refused (401) | The server has `DEMIFY_ADMIN_TOKEN`: open `https://<laptop-ip>:8443/unlock?token=<token>&next=/pulse` once on the phone. |
| `EADDRINUSE` on 8443 | Another pulse gateway (for example the old demify-pulse package) is running; stop it or use `--port 8444`. |
| Demify "not running" page | Start Demify on port 3000, or pass `--target http://127.0.0.1:<port>`. |
