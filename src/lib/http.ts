import "server-only";

/**
 * Blocks cross-site writes: a browser always sends Origin on a cross-origin
 * POST/DELETE, so if one is present its host must be ours. Devices and curl
 * send no Origin and are unaffected.
 */
export function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true; // "null" (sandboxed iframe, file://) or garbage
  }
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")]
    .flatMap((h) => (h ? h.split(",") : []))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return !hosts.includes(originHost.toLowerCase());
}

export function isJson(req: Request): boolean {
  return (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() === "application/json";
}
