// Starts gateway and bridge together, prefixes their logs, restarts one that
// crashes, and stops both on Ctrl+C. Spawns process.execPath (node), not npm
// (npm is npm.cmd on Windows).
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writeFileSync, rmSync } from "node:fs";
import { ROOT } from "./lib/env.mjs";

const procs = new Map();
let stopping = false;

function prefixLines(stream, prefix, out) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on("end", () => {
    if (buf) out.write(`${prefix} ${buf}\n`);
  });
}

function run(name) {
  const prefix = `[${name === "broker-lite" ? "broker" : name}]`.padEnd(9);
  const child = spawn(process.execPath, [join(ROOT, `${name}.mjs`)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  procs.set(name, child);
  prefixLines(child.stdout, prefix, process.stdout);
  prefixLines(child.stderr, prefix, process.stderr);
  child.on("exit", (code, signal) => {
    procs.delete(name);
    if (stopping) return;
    console.error(`${prefix} exited (${signal ?? code}); restarting in 2 s`);
    setTimeout(() => !stopping && run(name), 2000);
  });
}

function stop() {
  if (stopping) process.exit(130);
  stopping = true;
  console.log("\nStopping gateway and bridge (Ctrl+C again to force)...");
  for (const child of procs.values()) child.kill();
  const check = setInterval(() => {
    if (procs.size === 0) {
      clearInterval(check);
      process.exit(0);
    }
  }, 100);
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// stop-demo.ps1 stops exactly this process (and our children), nothing else.
const PID_FILE = join(ROOT, ".start.pid");
writeFileSync(PID_FILE, String(process.pid));
process.on("exit", () => rmSync(PID_FILE, { force: true }));

// EMBEDDED_BROKER=1 (set by tools/one-click.mjs when no broker runs): start
// the built-in broker first, so no Docker is needed.
if (process.env.EMBEDDED_BROKER === "1") run("broker-lite");
setTimeout(() => {
  run("gateway");
  run("bridge");
}, process.env.EMBEDDED_BROKER === "1" ? 800 : 0);
