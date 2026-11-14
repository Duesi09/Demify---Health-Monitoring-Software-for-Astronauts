import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config";
import type { Scenario, ScenarioType } from "../types";

/**
 * Active emergency training scenarios (one per crew member). Kept in memory
 * and mirrored to <dataDir>/demify-scenarios.json so a drill survives a
 * server restart. Scenarios end automatically after MAX_SCENARIO_MS so a
 * forgotten drill can never keep a crew member in alarm indefinitely.
 */

export const SCENARIO_TYPES: ScenarioType[] = ["stemi", "vf", "hypertensive-crisis", "stroke", "seizure"];
export const MAX_SCENARIO_MS = 30 * 60_000;

const file = () => path.join(config.dataDir, "demify-scenarios.json");

/*
 * State lives on globalThis (one copy per server process, shared by every
 * bundle: in dev, pages and route handlers are separate module instances)
 * and is re-read whenever the file's mtime changes, so a drill started
 * through the API is visible to server-rendered pages immediately.
 */
interface StoreState {
  map: Map<string, Scenario>;
  mtimeMs: number;
}
const G = globalThis as typeof globalThis & { __demifyScenarios?: StoreState };
let writeChain: Promise<void> = Promise.resolve();

function parse(raw: string): Map<string, Scenario> {
  try {
    const arr = JSON.parse(raw) as Scenario[];
    return new Map(
      (Array.isArray(arr) ? arr : [])
        .filter((s) => s && typeof s.crewId === "string" && SCENARIO_TYPES.includes(s.type) && !Number.isNaN(Date.parse(s.startedAt)))
        .map((s) => [s.crewId, s]),
    );
  } catch {
    return new Map();
  }
}

async function load(): Promise<Map<string, Scenario>> {
  let mtimeMs = -1;
  try {
    mtimeMs = (await fs.stat(file())).mtimeMs;
  } catch {
    /* no file yet */
  }
  const st = G.__demifyScenarios;
  if (st && (mtimeMs === -1 || st.mtimeMs === mtimeMs)) return st.map;
  let map = new Map<string, Scenario>();
  if (mtimeMs !== -1) {
    try {
      map = parse(await fs.readFile(file(), "utf8"));
    } catch {
      /* unreadable: start empty */
    }
  }
  if (st && mtimeMs === -1) return st.map;
  G.__demifyScenarios = { map, mtimeMs };
  return map;
}

function persist(map: Map<string, Scenario>) {
  const run = async () => {
    try {
      await fs.mkdir(config.dataDir, { recursive: true });
      const tmp = file() + ".tmp";
      await fs.writeFile(tmp, JSON.stringify([...map.values()]));
      await fs.rename(tmp, file());
      const st = await fs.stat(file());
      G.__demifyScenarios = { map, mtimeMs: st.mtimeMs };
    } catch (e) {
      console.error("[demify] could not persist scenarios:", e);
    }
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

function expired(s: Scenario, now: number) {
  return now - Date.parse(s.startedAt) > MAX_SCENARIO_MS;
}

export async function listScenarios(now = Date.now()): Promise<Scenario[]> {
  const map = await load();
  let changed = false;
  for (const [id, s] of map) {
    if (expired(s, now)) {
      map.delete(id);
      changed = true;
    }
  }
  if (changed) void persist(map);
  return [...map.values()];
}

export async function getScenario(crewId: string, now = Date.now()): Promise<Scenario | null> {
  return (await listScenarios(now)).find((s) => s.crewId === crewId) ?? null;
}

export async function startScenario(crewId: string, type: ScenarioType, now = Date.now()): Promise<Scenario> {
  const map = await load();
  const s: Scenario = { crewId, type, startedAt: new Date(now).toISOString() };
  map.set(crewId, s);
  await persist(map);
  return s;
}

export async function stopScenario(crewId?: string): Promise<void> {
  const map = await load();
  if (crewId) map.delete(crewId);
  else map.clear();
  await persist(map);
}
