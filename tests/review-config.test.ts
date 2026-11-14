import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VARS = [
  "DEMIFY_DATA_DIR",
  "DEMIFY_SNAPSHOT_DIR",
  "DEMIFY_SNAPSHOT_SEED_DIR",
  "DEMIFY_OFFLINE",
  "DEMIFY_CACHE_TTL",
  "DEMIFY_FETCH_TIMEOUT_MS",
  "DEMIFY_SIMULATE",
  "DEMIFY_MISSION",
  "DEMIFY_MISSION_START",
  "NASA_API_KEY",
  "OSDR_BASE_URL",
  "OSDR_BIODATA_URL",
  "SWPC_BASE_URL",
] as const;

async function load(env: Partial<Record<(typeof VARS)[number], string>>) {
  for (const name of VARS) vi.stubEnv(name, env[name] ?? "");
  vi.resetModules();
  return import("@/lib/config");
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("config: empty env vars count as unset (compose passes ${VAR:-} as \"\")", () => {
  it("uses every default when all variables are empty strings", async () => {
    const { config, currentMission } = await load({});
    expect(config.dataDir).toBe(path.join(process.cwd(), "data"));
    expect(config.snapshotDir).toBe(path.join(process.cwd(), "data", "runtime", "snapshots"));
    expect(config.snapshotSeedDir).toBe(path.join(process.cwd(), "data", "snapshots"));
    expect(config.offline).toBe(false);
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.fetchTimeoutMs).toBe(8000);
    expect(config.simulateTelemetry).toBe(true);
    expect(config.mission).toBe("iss");
    expect(currentMission().id).toBe("iss");
    expect(config.nasaApiKey).toBe("DEMO_KEY");
    expect(config.osdrBaseUrl).toBe("https://osdr.nasa.gov");
    expect(config.osdrBiodataUrl).toBe("https://visualization.osdr.nasa.gov");
    expect(config.swpcBaseUrl).toBe("https://services.swpc.noaa.gov");
    const expectedStart = new Date(Date.now() - 92 * 86_400_000).toISOString().slice(0, 10);
    expect(config.missionStart).toBe(expectedStart);
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats whitespace-only values as unset too", async () => {
    const { config } = await load({ DEMIFY_CACHE_TTL: "  ", NASA_API_KEY: " ", DEMIFY_MISSION: " " });
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.nasaApiKey).toBe("DEMO_KEY");
    expect(config.mission).toBe("iss");
  });

  it("still honours explicit values", async () => {
    const { config, currentMission, missionDay } = await load({
      DEMIFY_MISSION: "mars-transit",
      DEMIFY_MISSION_START: "2026-09-01",
      DEMIFY_OFFLINE: "true",
      DEMIFY_SIMULATE: "false",
      DEMIFY_CACHE_TTL: "0",
      DEMIFY_FETCH_TIMEOUT_MS: "2500",
      DEMIFY_DATA_DIR: "/data",
    });
    expect(currentMission().id).toBe("mars-transit");
    expect(config.missionStart).toBe("2026-09-01");
    expect(missionDay(Date.parse("2026-09-11T12:00:00Z"))).toBe(10);
    expect(config.offline).toBe(true);
    expect(config.simulateTelemetry).toBe(false);
    expect(config.cacheTtlSeconds).toBe(0);
    expect(config.fetchTimeoutMs).toBe(2500);
    expect(config.dataDir).toBe("/data");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("config: invalid values fall back with a warning", () => {
  it("unknown DEMIFY_MISSION -> iss", async () => {
    const { config, currentMission } = await load({ DEMIFY_MISSION: "moon-base" });
    expect(config.mission).toBe("iss");
    expect(currentMission().id).toBe("iss");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DEMIFY_MISSION"));
  });

  it("does not accept inherited object keys as a mission", async () => {
    const { config } = await load({ DEMIFY_MISSION: "toString" });
    expect(config.mission).toBe("iss");
  });

  it.each(["yesterday", "09/01/2026", "2026-02-30", "2026-13-01"])(
    "DEMIFY_MISSION_START=%s -> 92-day default, missionDay stays a number",
    async (value) => {
      const { config, missionDay } = await load({ DEMIFY_MISSION_START: value });
      expect(config.missionStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(missionDay())).toBe(false);
      expect(missionDay()).toBe(92);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("DEMIFY_MISSION_START"));
    },
  );

  it("non-numeric / out-of-range numbers -> defaults", async () => {
    const { config } = await load({ DEMIFY_CACHE_TTL: "abc", DEMIFY_FETCH_TIMEOUT_MS: "0" });
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.fetchTimeoutMs).toBe(8000);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("deployment wiring", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const compose = readFileSync(path.join(root, "docker-compose.yml"), "utf8");
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  const deployment = readFileSync(path.join(root, "docs", "DEPLOYMENT.md"), "utf8");

  it.each(["DEMIFY_MISSION_START", "DEMIFY_RETENTION_DAYS"])("%s reaches the container and is documented", (name) => {
    expect(compose).toMatch(new RegExp(`^\\s+${name}: \\$\\{${name}:-[^}]*\\}`, "m"));
    expect(envExample).toMatch(new RegExp(`^#?${name}=`, "m"));
    expect(deployment).toContain(`\`${name}\``);
  });

  it("the build-CA placeholder used by compose is not git-ignored", () => {
    expect(compose).toContain("${DEMIFY_BUILD_CA:-./docker/no-extra-ca.pem}");
    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8").split("\n");
    const pem = gitignore.indexOf("*.pem");
    const exception = gitignore.indexOf("!/docker/no-extra-ca.pem");
    expect(pem).toBeGreaterThanOrEqual(0);
    expect(exception).toBeGreaterThan(pem);
  });
});
