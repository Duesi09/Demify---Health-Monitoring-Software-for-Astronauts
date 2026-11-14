import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sensor-only test crew member ("test", src/lib/crew-mode.ts): never
 * simulated, so the monitor shows no signal until a sensor posts (the phone
 * camera pulse demo), while everyone else keeps the demo telemetry.
 */

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-sensor-only-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DEMIFY_SIMULATE", "true"); // demo telemetry ON, as on stage
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

const live = () => import("@/lib/monitor/live");
const store = () => import("@/lib/store/readings");

describe("sensor-only test crew member", () => {
  it("is in the default crew and flagged sensor-only", async () => {
    const { listCrew } = await store();
    const { isSensorOnly, simulatesTelemetry } = await import("@/lib/crew-mode");
    const test = (await listCrew()).find((c) => c.id === "test");
    expect(test?.name).toBe("Test Crew (phone)");
    expect(isSensorOnly(test!)).toBe(true);
    expect(simulatesTelemetry(test!)).toBe(false);
    expect(simulatesTelemetry({ id: "cdr" })).toBe(true);
  });

  it("shows no signal (all numerics null, source none, no alarms) without sensor data", async () => {
    const v = await (await live()).getLiveVitals("test");
    expect(v).not.toBeNull();
    expect(v!.source).toBe("none");
    expect([v!.hr, v!.sys, v!.dia, v!.map, v!.spo2, v!.resp, v!.temp]).toEqual([null, null, null, null, null, null, null]);
    expect(v!.alarms).toEqual([]);
  });

  it("shows the sensor heart rate as DEVICE data, nothing simulated beside it", async () => {
    const { addReadings } = await store();
    await addReadings([
      { crewId: "test", indicator: "heartRate", value: 77, unit: "bpm", takenAt: new Date().toISOString(), source: "sensor" },
    ]);
    const v = await (await live()).getLiveVitals("test");
    expect(v!.hr).toBe(77);
    expect(v!.source).toBe("sensor");
    expect(v!.sys).toBeNull();
    expect(v!.spo2).toBeNull();
  });

  it("goes back to no signal a few seconds after the sensor stops (no pulse detected)", async () => {
    const { addReadings } = await store();
    const { SENSOR_ONLY_FRESH_MS } = await import("@/lib/crew-mode");
    expect(SENSOR_ONLY_FRESH_MS).toBeLessThanOrEqual(10_000);
    const old = new Date(Date.now() - SENSOR_ONLY_FRESH_MS - 2_000).toISOString();
    await addReadings([{ crewId: "test", indicator: "heartRate", value: 80, unit: "bpm", takenAt: old, source: "sensor" }]);
    const v = await (await live()).getLiveVitals("test");
    expect(v!.hr).toBeNull();
    expect(v!.source).toBe("none");
  });

  it("keeps the two-minute freshness for everyone else", async () => {
    const { addReadings } = await store();
    const recent = new Date(Date.now() - 60_000).toISOString();
    await addReadings([{ crewId: "cdr", indicator: "heartRate", value: 91, unit: "bpm", takenAt: recent, source: "sensor" }]);
    const v = await (await live()).getLiveVitals("cdr");
    expect(v!.hr).toBe(91);
    expect(v!.source).toBe("mixed");
  });

  it("leaves the other crew members simulated", async () => {
    const v = await (await live()).getLiveVitals("cdr");
    expect(v!.source).toBe("simulated");
    expect(typeof v!.hr).toBe("number");
  });

  it("returns no simulated history for the test member from GET /api/readings", async () => {
    const { GET } = await import("@/app/api/readings/route");
    const res = await GET(new Request("http://localhost/api/readings?crewId=test&hours=24"));
    const { readings } = (await res.json()) as { readings: Array<{ source: string }> };
    expect(readings.filter((r) => r.source === "simulated")).toEqual([]);
    const cdr = await GET(new Request("http://localhost/api/readings?crewId=cdr&hours=24"));
    const cdrReadings = ((await cdr.json()) as { readings: Array<{ source: string }> }).readings;
    expect(cdrReadings.some((r) => r.source === "simulated")).toBe(true);
  });

  it("is added to an existing database that predates it", async () => {
    await fs.writeFile(
      path.join(dir, "demify-db.json"),
      JSON.stringify({ crew: [{ id: "cdr", name: "Commander", role: "Commander", baseline: {} }], readings: [] }),
    );
    const ids = (await (await store()).listCrew()).map((c) => c.id);
    expect(ids).toEqual(["cdr", "test"]);
  });
});
