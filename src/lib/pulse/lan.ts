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

/** Adapter names of Wi-Fi interfaces (Windows EN/DE, macOS, Linux). */
const WIRELESS = /wi-?fi|wlan|wireless|drahtlos|^en0$|^wl/i;
/** Virtual adapters (Docker, WSL, VMs, VPN overlays): never the hotspot. */
const VIRTUAL = /docker|veth|br-|vethernet|wsl|virtualbox|vmware|vmnet|hyper-v|tailscale|zerotier|host-only/i;

/**
 * Rank: Wi-Fi adapters first, then typical hotspot / home ranges
 * (192.168.x, 10.x), then 172.16-31.x (often Docker, WSL or VMs), and the
 * VirtualBox / docker-machine host-only defaults (192.168.56.x, 192.168.99.x)
 * last. Never loopback or link-local (169.254.x, no DHCP). IPv4 only: a phone
 * types and scans those.
 */
export function rankLanInterfaces(
  interfaces: Record<string, NetAddress[] | undefined>,
): { address: string; adapter: string }[] {
  const score = (ip: string, adapter: string): number => {
    if (/^192\.168\.(56|99)\./.test(ip)) return 9;
    if (WIRELESS.test(adapter)) return 0;
    if (ip.startsWith("192.168.")) return 1;
    if (ip.startsWith("10.")) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 4;
    return 3;
  };
  const out = new Map<string, { address: string; adapter: string; score: number }>();
  for (const [adapter, list] of Object.entries(interfaces)) {
    if (VIRTUAL.test(adapter)) continue;
    for (const a of list ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal) continue;
      if (a.address.startsWith("127.") || a.address.startsWith("169.254.")) continue;
      if (!out.has(a.address)) out.set(a.address, { address: a.address, adapter, score: score(a.address, adapter) });
    }
  }
  return [...out.values()]
    .sort((x, y) => x.score - y.score || x.address.localeCompare(y.address))
    .map(({ address, adapter }) => ({ address, adapter }));
}

/** The ranked addresses only (see rankLanInterfaces). */
export function rankLanAddresses(interfaces: Record<string, NetAddress[] | undefined>): string[] {
  return rankLanInterfaces(interfaces).map((e) => e.address);
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
