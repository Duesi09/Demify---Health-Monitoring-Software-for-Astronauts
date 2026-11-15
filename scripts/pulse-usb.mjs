#!/usr/bin/env node
// Phone pulse demo over a USB cable (no Wi-Fi, no firewall, no certificate).
//
// Forwards port 3000 on the Android phone to port 3000 on this laptop with
// `adb reverse`. The phone then opens http://localhost:3000/pulse?crew=test
// in Chrome; localhost counts as a secure page, so the camera is allowed.
//
//   npm run pulse:usb
//
// Needs adb (Android platform tools): on the PATH, or unpacked into
// ./platform-tools/ (git-ignored). The phone needs USB debugging switched on
// (Settings > About phone > Software information > tap Build number 7 times,
// then Developer options > USB debugging) and "Allow USB debugging" confirmed.
// Run it again after re-plugging the cable.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : "3000";
const DOWNLOAD = "https://dl.google.com/android/repository/platform-tools-latest-windows.zip";

function findAdb() {
  const local = path.join(ROOT, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
  if (existsSync(local)) return local;
  try {
    execFileSync("adb", ["version"], { stdio: "ignore" });
    return "adb";
  } catch {
    return null;
  }
}

function adb(bin, args) {
  return execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const bin = findAdb();
if (!bin) {
  console.error("adb not found. Download the Android platform tools into the Demify folder (Git Bash):");
  console.error(`  curl -LO ${DOWNLOAD}`);
  console.error("  unzip -o platform-tools-latest-windows.zip");
  console.error("(macOS: brew install android-platform-tools; Linux: apt install adb)");
  process.exit(1);
}

let devices;
try {
  devices = adb(bin, ["devices"])
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length >= 2);
} catch (err) {
  console.error(`adb failed: ${err.message}`);
  process.exit(1);
}

const ready = devices.filter((d) => d[1] === "device");
if (ready.length === 0) {
  if (devices.some((d) => d[1] === "unauthorized")) {
    console.error('Phone found but not allowed yet: confirm "Allow USB debugging" on the phone, then run this again.');
  } else {
    console.error("No phone found. Check: USB debugging on, cable can transfer data (not charge-only),");
    console.error('USB mode "File transfer", and close chrome://inspect tabs (they compete with adb).');
  }
  process.exit(1);
}

for (const [serial] of ready) {
  try {
    adb(bin, ["-s", serial, "reverse", `tcp:${PORT}`, `tcp:${PORT}`]);
    console.log(`OK  phone ${serial}: localhost:${PORT} on the phone -> localhost:${PORT} on this laptop`);
  } catch (err) {
    console.error(`adb reverse failed for ${serial}: ${err.message}`);
    process.exit(1);
  }
}

console.log("");
console.log("On the phone, open in Chrome:");
console.log(`  http://localhost:${PORT}/pulse?crew=test`);
console.log("Tap Start, allow the camera, fingertip gently over camera and flash.");
console.log("Re-plugged the cable? Run npm run pulse:usb again.");
