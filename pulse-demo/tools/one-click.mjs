// One click: sets up and starts the whole phone pulse demo on any Windows
// laptop with Node.js. Run by START-DEMO.cmd (double-click).
//
//   1. installs the packages (first time only)
//   2. creates .env with a fresh phone token (first time only)
//   3. starts Demify (npm run dev in its own window) if it is not running
//   4. uses a running MQTT broker, or the built-in one (no Docker needed)
//   5. opens the Demify monitor for Test Crew in the browser
//   6. starts gateway + bridge and prints the phone link and a QR code
//
// Camera pulse estimate for a demo, not a medical measurement.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { ROOT } from "../lib/env.mjs";

const ok = (t) => console.log(`  OK    ${t}`);
const warn = (t) => console.log(`  WARN  ${t}`);
const fail = (t) => {
  console.log(`  FAIL  ${t}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listening(port) {
  return new Promise((res) => {
    const s = connect(port, "127.0.0.1");
    s.setTimeout(1000);
    s.once("connect", () => (s.destroy(), res(true)));
    s.once("error", () => res(false));
    s.once("timeout", () => (s.destroy(), res(false)));
  });
}

async function getJson(url, ms = 5000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

function npm(args, cwd) {
  console.log(`        npm ${args.join(" ")} in ${cwd} (first time only, can take a few minutes)...`);
  const r = spawnSync(`npm ${args.join(" ")}`, { cwd, stdio: "inherit", shell: true });
  return r.status === 0;
}

const isDemify = (dir) => dir && existsSync(join(dir, "package.json")) && existsSync(join(dir, "src", "lib", "crew-mode.ts"));

console.log("\n=== Demify pulse demo: one-click start ===\n");

// 1. Node version
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node ${process.versions.node} is too old: install Node 24 LTS from nodejs.org`);
ok(`Node ${process.versions.node}`);

// 2. .env (fresh token on a new laptop)
const envFile = join(ROOT, ".env");
const parentDemify = resolve(ROOT, "..");
if (!existsSync(envFile)) {
  const token = randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12);
  let text = readFileSync(join(ROOT, ".env.example"), "utf8");
  text = text.replace(/^PULSE_TOKEN=.*$/m, `PULSE_TOKEN=${token}`).replace(/^CREW_ID=.*$/m, "CREW_ID=test");
  if (isDemify(parentDemify)) text = text.replace(/^DEMIFY_DIR=.*$/m, `DEMIFY_DIR=${parentDemify}`);
  writeFileSync(envFile, text);
  ok(`.env created with a new phone token (${token.slice(0, 3)}...)`);
}
process.loadEnvFile(envFile);
const DEMIFY_URL = (process.env.DEMIFY_URL || "http://127.0.0.1:3000").trim();
const PORT = Number(process.env.PORT || 8443);
const CREW = (process.env.CREW_ID || "test").trim();
const envDir = (process.env.DEMIFY_DIR || "").trim();
const DEMIFY_DIR = isDemify(envDir) ? envDir : isDemify(parentDemify) ? parentDemify : null;

// 3. Gateway already running?
if (await listening(PORT)) {
  warn(`Port ${PORT} is in use: the demo is probably already running in another window.`);
  spawn("cmd", ["/c", "start", "", `${DEMIFY_URL.replace("127.0.0.1", "localhost")}/crew/${CREW}`], { detached: true, stdio: "ignore" }).unref();
  console.log("        Close that window first if you want to restart it.");
  process.exit(0);
}

// 4. Packages of the pulse demo
if (!existsSync(join(ROOT, "node_modules", "aedes")) && !npm(["ci", "--no-audit", "--no-fund"], ROOT)) fail("npm ci failed in the pulse demo folder");
ok("pulse demo packages installed");

// 5. Demify
let health = await getJson(`${DEMIFY_URL}/api/health`);
if (!health) {
  if (!DEMIFY_DIR) fail(`Demify is not running at ${DEMIFY_URL} and the Demify folder was not found (set DEMIFY_DIR in .env).`);
  if (!existsSync(join(DEMIFY_DIR, "node_modules", "next")) && !npm(["ci", "--no-audit", "--no-fund"], DEMIFY_DIR)) fail("npm ci failed in the Demify folder");
  console.log("        starting Demify in its own window (npm run dev)...");
  spawn("cmd", ["/c", "start", "Demify (npm run dev)", "/D", DEMIFY_DIR, "cmd", "/k", "npm run dev"], { detached: true, stdio: "ignore" }).unref();
  const until = Date.now() + 180_000;
  while (!health && Date.now() < until) {
    await sleep(2000);
    process.stdout.write(".");
    health = await getJson(`${DEMIFY_URL}/api/health`);
  }
  console.log("");
  if (!health) fail("Demify did not start within 3 minutes: look at the Demify window for the error.");
}
ok(`Demify at ${DEMIFY_URL}`);
if (DEMIFY_DIR) {
  const b = spawnSync("git", ["-C", DEMIFY_DIR, "branch", "--show-current"], { encoding: "utf8" });
  const branch = (b.stdout || "").trim();
  if (branch && !["OG-Presentation", "presentation"].includes(branch)) warn(`Demify is on branch '${branch}': use OG-Presentation (Test Crew is missing elsewhere).`);
}
// The first visit compiles the page (dev server): do it now, not on stage.
await getJson(`${DEMIFY_URL}/crew/${CREW}`, 120_000);
const live = await getJson(`${DEMIFY_URL}/api/vitals/live?crewId=${CREW}`, 60_000);
if (!live) warn(`Demify has no crew member '${CREW}' (wrong branch?).`);
else if (live.scenario) warn(`A DRILL is running for ${CREW}: end it in Demify, sensor data is ignored during drills.`);
else ok(`Test Crew ready (heart rate now ${live.hr ?? "--"})`);

// 6. Broker: a running one (Docker Mosquitto) or the built-in one
const embedded = !(await listening(1883));
ok(embedded ? "MQTT: built-in broker (no Docker needed)" : "MQTT: broker already running on 1883");

// 7. Monitor in the browser
spawn("cmd", ["/c", "start", "", `${DEMIFY_URL.replace("127.0.0.1", "localhost")}/crew/${CREW}`], { detached: true, stdio: "ignore" }).unref();
ok("Demify monitor opened in the browser");

console.log(`
  Phone: join this laptop and the phone to the SAME network (best: the
  phone's own hotspot), then scan the QR code below with the phone camera.
  Certificate warning on the phone is normal: Show Details / Advanced -> visit.
  If Windows asks whether Node.js may use the network: tick Private, Allow.
  Stop: close this window (or Ctrl+C).
`);

// 8. Gateway + bridge (+ built-in broker), in this window
const child = spawn(process.execPath, [join(ROOT, "start.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, EMBEDDED_BROKER: embedded ? "1" : "0" },
});
const forward = () => child.kill("SIGINT");
process.on("SIGINT", forward);
process.on("SIGTERM", forward);
child.on("exit", (code) => process.exit(code ?? 0));
