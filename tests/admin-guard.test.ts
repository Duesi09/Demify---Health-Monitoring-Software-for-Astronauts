import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Optional write protection (DEMIFY_ADMIN_TOKEN): with a token set, the write
 * APIs need the x-demify-admin header or the cookie from GET /unlock; without
 * one, everything behaves as before.
 */

const TOKEN = "stage-token-0123456789abcdef";
const HOST = "localhost:3311";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "demify-admin-"));
  vi.stubEnv("DEMIFY_DATA_DIR", dir);
  vi.stubEnv("DEMIFY_SIMULATE", "false");
  vi.stubEnv("DEMIFY_ADMIN_TOKEN", "");
  // The drill store keeps its state on globalThis; start each test empty.
  delete (globalThis as { __demifyScenarios?: unknown }).__demifyScenarios;
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (globalThis as { __demifyScenarios?: unknown }).__demifyScenarios;
  await fs.rm(dir, { recursive: true, force: true });
});

const readingsRoute = () => import("@/app/api/readings/route");
const scenariosRoute = () => import("@/app/api/scenarios/route");
const unlockRoute = () => import("@/app/unlock/route");

const reading = { crewId: "cdr", indicator: "heartRate", value: 64, unit: "bpm", source: "sensor" };

function postReading(headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}/api/readings`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json", ...headers },
    body: JSON.stringify(reading),
  });
}

function startDrill(headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}/api/scenarios`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json", ...headers },
    body: JSON.stringify({ crewId: "plt", type: "stemi" }),
  });
}

function endDrill(headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}/api/scenarios?crewId=plt`, { method: "DELETE", headers: { host: HOST, ...headers } });
}

function unlock(token: string | null, headers: Record<string, string> = {}) {
  const qs = token === null ? "" : `?token=${encodeURIComponent(token)}`;
  return new Request(`http://${HOST}/unlock${qs}`, { headers: { host: HOST, ...headers } });
}

/** Visits /unlock with the right token and returns the cookie pair a browser would send back. */
async function unlockCookie(): Promise<string> {
  const { GET } = await unlockRoute();
  const res = await GET(unlock(TOKEN));
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0];
}

async function storedReadings(): Promise<number> {
  const { listReadings } = await import("@/lib/store/readings");
  return (await listReadings()).length;
}

describe("without DEMIFY_ADMIN_TOKEN (default): unchanged", () => {
  it("accepts readings and drills without any token", async () => {
    const { POST } = await readingsRoute();
    expect((await POST(postReading())).status).toBe(201);
    const scenarios = await scenariosRoute();
    expect((await scenarios.POST(startDrill())).status).toBe(201);
    expect((await scenarios.DELETE(endDrill())).status).toBe(200);
  });

  it("treats a whitespace-only token as unset", async () => {
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "   ");
    const { POST } = await readingsRoute();
    expect((await POST(postReading())).status).toBe(201);
  });

  it("/unlock just redirects to the overview and sets no cookie", async () => {
    const { GET } = await unlockRoute();
    const res = await GET(unlock("anything"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("with DEMIFY_ADMIN_TOKEN set", () => {
  beforeEach(() => {
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", TOKEN);
  });

  it("POST /api/readings without the token: 401 JSON, nothing stored", async () => {
    const { POST } = await readingsRoute();
    const res = await POST(postReading());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = await res.json();
    expect(body.error).toMatch(/Admin token required/);
    expect(body.error).toContain("/unlock?token=");
    expect(await storedReadings()).toBe(0);
  });

  it("POST /api/readings with a wrong header or a forged cookie: 401", async () => {
    const { POST } = await readingsRoute();
    expect((await POST(postReading({ "x-demify-admin": "wrong" }))).status).toBe(401);
    expect((await POST(postReading({ "x-demify-admin": TOKEN.slice(0, -1) }))).status).toBe(401);
    expect((await POST(postReading({ "x-demify-admin": "" }))).status).toBe(401);
    // The cookie must hold the derived value, not the raw token.
    expect((await POST(postReading({ cookie: `demify_admin=${TOKEN}` }))).status).toBe(401);
    expect((await POST(postReading({ cookie: "demify_admin=" }))).status).toBe(401);
    expect(await storedReadings()).toBe(0);
  });

  it("POST /api/readings with the x-demify-admin header: 201", async () => {
    const { POST } = await readingsRoute();
    expect((await POST(postReading({ "x-demify-admin": TOKEN }))).status).toBe(201);
    expect(await storedReadings()).toBe(1);
  });

  it("POST /api/readings with the unlock cookie: 201", async () => {
    const cookie = await unlockCookie();
    const { POST } = await readingsRoute();
    expect((await POST(postReading({ cookie: `theme=light; ${cookie}` }))).status).toBe(201);
  });

  it("drills: POST and DELETE /api/scenarios need the token", async () => {
    const { GET, POST, DELETE } = await scenariosRoute();
    expect((await POST(startDrill())).status).toBe(401);
    expect((await (await GET()).json()).scenarios).toEqual([]);

    expect((await POST(startDrill({ "x-demify-admin": TOKEN }))).status).toBe(201);
    expect((await (await GET()).json()).scenarios).toHaveLength(1);

    expect((await DELETE(endDrill())).status).toBe(401);
    expect((await (await GET()).json()).scenarios).toHaveLength(1);

    const cookie = await unlockCookie();
    expect((await DELETE(endDrill({ cookie }))).status).toBe(200);
    expect((await (await GET()).json()).scenarios).toEqual([]);

    expect((await POST(startDrill({ cookie }))).status).toBe(201);
  });

  it("a cross-site request is still refused with 403, token or not", async () => {
    const { POST } = await readingsRoute();
    expect((await POST(postReading({ origin: "http://evil.example", "x-demify-admin": TOKEN }))).status).toBe(403);
  });

  it("reads stay open", async () => {
    const readings = await readingsRoute();
    expect((await readings.GET(new Request(`http://${HOST}/api/readings?crewId=cdr`))).status).toBe(200);
    const scenarios = await scenariosRoute();
    expect((await scenarios.GET()).status).toBe(200);
  });

  it("GET /unlock with the right token sets an httpOnly SameSite=Strict cookie and redirects to /", async () => {
    const { GET } = await unlockRoute();
    const res = await GET(unlock(TOKEN));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^demify_admin=[A-Za-z0-9_-]+;/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain(TOKEN);
    expect(setCookie).not.toContain("Secure"); // plain HTTP: a Secure cookie would be dropped
  });

  it("GET /unlock behind a TLS proxy marks the cookie Secure", async () => {
    const { GET } = await unlockRoute();
    const res = await GET(unlock(TOKEN, { "x-forwarded-proto": "https" }));
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("GET /unlock with a wrong or missing token: 401 JSON, no cookie", async () => {
    const { GET } = await unlockRoute();
    for (const req of [unlock("wrong"), unlock(null), unlock(`${TOKEN}x`)]) {
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect((await res.json()).error).toMatch(/admin token/i);
    }
  });

  it("rotating the token invalidates cookies issued for the old one", async () => {
    const cookie = await unlockCookie();
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", `${TOKEN}-rotated`);
    const { POST } = await readingsRoute();
    expect((await POST(postReading({ cookie }))).status).toBe(401);
  });
});
