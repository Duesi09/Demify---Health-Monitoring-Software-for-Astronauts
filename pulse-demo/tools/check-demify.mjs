// Polls Demify's live monitor once per second and prints hr and source.
//   npm run check            (crew from .env CREW_ID, default cdr)
import { loadEnv, stamp } from "../lib/env.mjs";
const env = loadEnv();
const crew = process.argv[2] ?? env.CREW_ID;
const url = new URL(`/api/vitals/live?crewId=${encodeURIComponent(crew)}`, env.DEMIFY_URL);
console.log(`check: polling ${url} (Ctrl+C stops)`);
let stop = false;
process.on("SIGINT", () => (stop = true));
while (!stop) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const v = await res.json();
    const drill = v.scenario ? `  DRILL RUNNING (${v.scenario.label ?? v.scenario.type}): sensor data ignored` : "";
    console.log(`${stamp()} hr ${String(v.hr).padStart(3)}  source ${v.source}${drill}`);
  } catch (err) {
    console.log(`${stamp()} Demify unreachable (${err?.cause?.code ?? err.name}): is it running at ${env.DEMIFY_URL}?`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
