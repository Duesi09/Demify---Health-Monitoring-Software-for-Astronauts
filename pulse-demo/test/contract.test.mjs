import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validatePulse,
  buildReadings,
  parseVitalsMessage,
  topicFor,
  crewFromTopic,
  tokenMatches,
  demifyErrorHint,
  isLanAddress,
  isHostOnlyAddress,
  isWifiAdapter,
  phoneLinkRank,
  DEMIFY_HR_RANGE,
  BPM_MIN,
  BPM_MAX,
} from "../lib/contract.mjs";

describe("gateway: validatePulse", () => {
  test("accepts a good reading", () => {
    assert.deepEqual(validatePulse({ crewId: "cdr", bpm: 72, quality: 0.83, fps: 29.7 }), {
      ok: true,
      kind: "reading",
      crewId: "cdr",
      bpm: 72,
      quality: 0.83,
      fps: 30,
    });
  });

  test("heartbeats (no bpm)", () => {
    assert.deepEqual(validatePulse({ crewId: "cdr", fingerOn: false }), { ok: true, kind: "heartbeat", crewId: "cdr", fingerOn: false });
    assert.deepEqual(validatePulse({ crewId: "ms1", fingerOn: true }), { ok: true, kind: "heartbeat", crewId: "ms1", fingerOn: true });
  });

  test("rejects crew ids that could inject MQTT topics or are odd", () => {
    for (const crewId of ["", "CDR", "cdr/../x", "cdr/#", "+", "a b", "x".repeat(33), 5, null, "cdr\u0000"]) {
      const r = validatePulse({ crewId, bpm: 70, quality: 0.8 });
      assert.equal(r.ok, false, `crewId ${JSON.stringify(crewId)}`);
    }
  });

  test("rejects bad bpm and quality", () => {
    for (const bpm of [29, 221, 72.5, "72", NaN, Infinity, null]) {
      assert.equal(validatePulse({ crewId: "cdr", bpm, quality: 0.8 }).ok, false, `bpm ${bpm}`);
    }
    for (const quality of [-0.1, 1.1, "0.8", NaN, undefined]) {
      assert.equal(validatePulse({ crewId: "cdr", bpm: 70, quality }).ok, false, `quality ${quality}`);
    }
    assert.equal(validatePulse({ crewId: "cdr", bpm: 70, quality: 0.8, fps: -1 }).ok, false);
  });

  test("rejects non-objects", () => {
    for (const body of [null, [], "x", 3]) assert.equal(validatePulse(body).ok, false);
  });

  test("bpm range is inside Demify's heartRate inputRange", () => {
    assert.ok(BPM_MIN >= DEMIFY_HR_RANGE[0] && BPM_MAX <= DEMIFY_HR_RANGE[1]);
    assert.equal(validatePulse({ crewId: "cdr", bpm: 30, quality: 0 }).ok, true);
    assert.equal(validatePulse({ crewId: "cdr", bpm: 220, quality: 1 }).ok, true);
  });
});

describe("gateway: buildReadings and topics", () => {
  test("builds the Demify reading array with the laptop clock", () => {
    const now = new Date("2026-11-15T15:30:01.000Z");
    assert.deepEqual(buildReadings({ crewId: "cdr", bpm: 72, quality: 0.834 }, now), [
      {
        crewId: "cdr",
        indicator: "heartRate",
        value: 72,
        unit: "bpm",
        takenAt: "2026-11-15T15:30:01.000Z",
        source: "sensor",
        note: "phone camera PPG, quality 0.83",
      },
    ]);
  });

  test("topic round trip", () => {
    assert.equal(topicFor("cdr"), "demify/crew/cdr/vitals");
    assert.equal(crewFromTopic("demify/crew/cdr/vitals"), "cdr");
    assert.equal(crewFromTopic("demify/crew/CDR/vitals"), null);
    assert.equal(crewFromTopic("demify/crew/cdr/other"), null);
    assert.equal(crewFromTopic("x/demify/crew/cdr/vitals"), null);
  });

  test("token comparison", () => {
    assert.equal(tokenMatches("abc123", "abc123"), true);
    assert.equal(tokenMatches("abc124", "abc123"), false);
    assert.equal(tokenMatches("", "abc123"), false);
    assert.equal(tokenMatches(undefined, "abc123"), false);
    assert.equal(tokenMatches("abc123", ""), false);
  });
});

describe("bridge: parseVitalsMessage", () => {
  const now = Date.parse("2026-11-15T15:30:05.000Z");
  const reading = (over = {}) => ({
    crewId: "cdr",
    indicator: "heartRate",
    value: 72,
    unit: "bpm",
    takenAt: "2026-11-15T15:30:04.000Z",
    source: "sensor",
    note: "phone camera PPG, quality 0.83",
    ...over,
  });
  const msg = (arr) => Buffer.from(JSON.stringify(arr));

  test("passes a good reading through unchanged", () => {
    const r = parseVitalsMessage("demify/crew/cdr/vitals", msg([reading()]), now);
    assert.equal(r.ok, true);
    assert.deepEqual(r.readings, [reading()]);
    assert.equal(r.restamped, 0);
    assert.equal(r.dropped, 0);
  });

  test("gateway output is accepted by the bridge", () => {
    const built = buildReadings({ crewId: "cdr", bpm: 64, quality: 0.7 }, new Date(now - 500));
    const r = parseVitalsMessage(topicFor("cdr"), msg(built), now);
    assert.equal(r.ok, true);
    assert.deepEqual(r.readings, built);
  });

  test("drops readings older than 10 s", () => {
    const r = parseVitalsMessage("demify/crew/cdr/vitals", msg([reading({ takenAt: "2026-11-15T15:29:50.000Z" })]), now);
    assert.equal(r.ok, true);
    assert.equal(r.readings.length, 0);
    assert.equal(r.dropped, 1);
  });

  test("re-stamps missing, invalid or far-future takenAt", () => {
    for (const takenAt of [undefined, "yesterday", "2026-11-15T15:35:00.000Z"]) {
      const r = parseVitalsMessage("demify/crew/cdr/vitals", msg([reading({ takenAt })]), now);
      assert.equal(r.ok, true);
      assert.equal(r.readings[0].takenAt, new Date(now).toISOString(), String(takenAt));
      assert.equal(r.restamped, 1);
    }
  });

  test("never forwards a takenAt in the future", () => {
    const r = parseVitalsMessage("demify/crew/cdr/vitals", msg([reading({ takenAt: "2026-11-15T15:30:30.000Z" })]), now);
    assert.equal(r.readings[0].takenAt, new Date(now).toISOString());
  });

  test("rejects bad messages without throwing", () => {
    const cases = [
      ["demify/crew/cdr/vitals", "not json"],
      ["demify/crew/cdr/vitals", msg({})],
      ["demify/crew/cdr/vitals", msg([])],
      ["demify/crew/cdr/vitals", msg([reading({ indicator: "spo2", unit: "%" })])],
      ["demify/crew/cdr/vitals", msg([reading({ value: 300 })])],
      ["demify/crew/cdr/vitals", msg([reading({ value: 71.5 })])],
      ["demify/crew/cdr/vitals", msg([reading({ unit: "BPM" })])],
      ["demify/crew/cdr/vitals", msg([reading({ crewId: "plt" })])],
      ["demify/crew/cdr/vitals", msg([null])],
      ["demify/crew/../vitals", msg([reading()])],
      ["other/topic", msg([reading()])],
      ["demify/crew/cdr/vitals", msg(Array.from({ length: 51 }, () => reading()))],
    ];
    for (const [topic, payload] of cases) {
      const r = parseVitalsMessage(topic, payload, now);
      assert.equal(r.ok, false, `${topic} ${String(payload).slice(0, 60)}`);
      assert.equal(typeof r.error, "string");
    }
  });

  test("drops unknown fields and forces source sensor", () => {
    const r = parseVitalsMessage("demify/crew/cdr/vitals", msg([reading({ source: "manual", extra: 1 })]), now);
    assert.equal(r.readings[0].source, "sensor");
    assert.equal("extra" in r.readings[0], false);
  });
});

describe("hints and addresses", () => {
  test("error hints", () => {
    assert.match(demifyErrorHint(401), /DEMIFY_ADMIN_TOKEN/);
    assert.match(demifyErrorHint(403), /Origin/);
    assert.match(demifyErrorHint(429), /rate limited/);
    assert.match(demifyErrorHint("ECONNREFUSED"), /Demify running/);
    assert.match(demifyErrorHint(502), /server error/);
  });

  test("LAN addresses", () => {
    for (const ip of ["192.168.43.10", "10.0.0.5", "172.20.10.2"]) assert.equal(isLanAddress(ip), true, ip);
    for (const ip of ["100.95.1.1", "127.0.0.1", "172.32.0.1", "8.8.8.8"]) assert.equal(isLanAddress(ip), false, ip);
  });

  test("phone link order: Wi-Fi first, VirtualBox host-only never (the QR code uses the first)", () => {
    const virtual = (name) => /vEthernet|Tailscale/i.test(name);
    const ifaces = [
      { ip: "192.168.56.1", name: "Ethernet 2" },
      { ip: "172.20.10.13", name: "WLAN" },
      { ip: "169.254.83.107", name: "Tailscale" },
      { ip: "172.28.240.1", name: "vEthernet (Default Switch)" },
      { ip: "192.168.1.20", name: "Ethernet" },
    ];
    const sorted = [...ifaces].sort((x, y) => phoneLinkRank(x, virtual) - phoneLinkRank(y, virtual));
    assert.equal(sorted[0].ip, "172.20.10.13");
    assert.equal(sorted[1].ip, "192.168.1.20");
    assert.equal(phoneLinkRank({ ip: "192.168.56.1", name: "Ethernet 2" }, virtual), 99);
    assert.equal(phoneLinkRank({ ip: "172.28.240.1", name: "vEthernet (Default Switch)" }, virtual), 99);
    assert.equal(isHostOnlyAddress("192.168.99.100"), true);
    assert.equal(isHostOnlyAddress("192.168.43.1"), false);
    for (const n of ["WLAN", "Wi-Fi", "WiFi", "Drahtlos-LAN", "en0", "wlp2s0"]) assert.equal(isWifiAdapter(n), true, n);
    assert.equal(isWifiAdapter("Ethernet 2"), false);
  });
});
