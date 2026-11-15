import { describe, expect, it, vi } from "vitest";
import { isPlainHost, phonePulseUrl, rankLanAddresses } from "@/lib/pulse/lan";

describe("phone pulse demo: laptop addresses", () => {
  it("ranks hotspot/home addresses first and drops loopback, link-local, IPv6 and virtual adapters", () => {
    const ips = rankLanAddresses({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      "vEthernet (WSL)": [{ address: "172.20.16.1", family: "IPv4", internal: false }],
      docker0: [{ address: "172.17.0.1", family: "IPv4", internal: false }],
      "WLAN": [
        { address: "fe80::1", family: "IPv6", internal: false },
        { address: "192.168.43.17", family: "IPv4", internal: false },
      ],
      Ethernet: [
        { address: "169.254.10.2", family: "IPv4", internal: false },
        { address: "172.18.5.4", family: 4, internal: false },
      ],
      eth1: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    });
    expect(ips).toEqual(["192.168.43.17", "10.0.0.5", "172.18.5.4"]);
  });

  it("accepts plain IPs and host names only", () => {
    expect(isPlainHost("192.168.43.17")).toBe(true);
    expect(isPlainHost("my-laptop.local")).toBe(true);
    expect(isPlainHost("https://evil.example")).toBe(false);
    expect(isPlainHost("1.2.3.4:8443")).toBe(false);
    expect(isPlainHost("a/b")).toBe(false);
    expect(isPlainHost("")).toBe(false);
  });

  it("builds the phone link over the HTTPS proxy", () => {
    expect(phonePulseUrl("192.168.43.17", "test")).toBe("https://192.168.43.17:8443/pulse?crew=test");
  });
});

describe("/unlock ?next=", () => {
  const unlock = (next: string) =>
    new Request(`http://localhost:3000/unlock?token=t0ken-for-tests-0123456789&next=${encodeURIComponent(next)}`, {
      headers: { host: "localhost:3000" },
    });

  it("goes to a path on this site and never to another site", async () => {
    vi.stubEnv("DEMIFY_ADMIN_TOKEN", "t0ken-for-tests-0123456789");
    try {
      const { GET } = await import("@/app/unlock/route");
      const loc = async (next: string) => (await GET(unlock(next))).headers.get("location");
      expect(await loc("/pulse?crew=test")).toBe("/pulse?crew=test");
      expect(await loc("//evil.example")).toBe("/");
      expect(await loc("/\\evil.example")).toBe("/");
      expect(await loc("/\t/evil.example")).toBe("/");
      expect(await loc("https://evil.example")).toBe("/");
      expect(await loc("/pülse")).toBe("/");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
