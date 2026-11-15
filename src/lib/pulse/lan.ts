/**
 * LAN addresses for the phone pulse demo: which address of the laptop a phone
 * in the same Wi-Fi or hotspot can reach. Shared by the /pulse/connect page
 * and scripts/pulse-https.mjs (which has its own copy of the ranking, plain JS).
 */

/** HTTPS port of the pulse proxy (scripts/pulse-https.mjs). */
export const PULSE_HTTPS_PORT = 8443;

export interface NetAddress {
  address: string;
  family: string | number;
  internal: boolean;
}

/**
 * Rank: typical hotspot / home Wi-Fi ranges first (192.168.x, 10.x), then
 * 172.16-31.x (often Docker, WSL or VM adapters), never loopback or
 * link-local (169.254.x, no DHCP). IPv4 only: a phone types and scans those.
 */
export function rankLanAddresses(interfaces: Record<string, NetAddress[] | undefined>): string[] {
  const score = (ip: string): number => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 3;
    return 2;
  };
  const ips = new Set<string>();
  for (const [name, list] of Object.entries(interfaces)) {
    // Virtual adapters (Docker, WSL, VirtualBox, VMware, Hyper-V) are never the hotspot.
    if (/docker|veth|br-|vethernet|wsl|virtualbox|vmware|vmnet|hyper-v|tailscale|zerotier/i.test(name)) continue;
    for (const a of list ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal) continue;
      if (a.address.startsWith("127.") || a.address.startsWith("169.254.")) continue;
      ips.add(a.address);
    }
  }
  return [...ips].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

/** A plain IPv4 address or host name (no scheme, path or port), as accepted in ?host=. */
export function isPlainHost(value: string): boolean {
  return /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/i.test(
    value,
  );
}

/** The address the phone opens: the pulse page over the HTTPS proxy. */
export function phonePulseUrl(host: string, crewId: string, port = PULSE_HTTPS_PORT): string {
  return `https://${host}:${port}/pulse?crew=${encodeURIComponent(crewId)}`;
}
