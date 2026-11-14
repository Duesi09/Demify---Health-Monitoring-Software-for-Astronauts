import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

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

/* ------------------------------------------------------------------------- */
/* Optional admin token (DEMIFY_ADMIN_TOKEN) for the write APIs               */
/* ------------------------------------------------------------------------- */

/** Header a device, script or curl sends the admin token in. */
export const ADMIN_HEADER = "x-demify-admin";
/** httpOnly cookie set by GET /unlock?token=..., sent by the browser on same-site requests. */
export const ADMIN_COOKIE = "demify_admin";
/** How long an unlocked browser stays unlocked. */
export const ADMIN_COOKIE_MAX_AGE_S = 7 * 24 * 3600;

/**
 * The configured admin token, or undefined when write protection is off.
 * Read on every call (not cached in config) so changing the variable takes
 * effect on the next restart without any other wiring, and tests can stub it.
 * Empty or whitespace-only counts as unset, like every other setting.
 */
export function adminToken(): string | undefined {
  const value = process.env.DEMIFY_ADMIN_TOKEN?.trim();
  return value ? value : undefined;
}

/**
 * Constant-time string comparison. Both sides are hashed first, so the
 * comparison takes the same time whatever the lengths and contents are.
 */
export function safeEqual(candidate: string | null | undefined, expected: string): boolean {
  if (candidate == null) return false;
  const a = createHmac("sha256", "demify-compare").update(candidate).digest();
  const b = createHmac("sha256", "demify-compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Cookie value for an unlocked browser: derived from the token, so the
 * browser never stores the token itself. Rotating the token logs every
 * browser out.
 */
export function adminCookieValue(token: string): string {
  return createHmac("sha256", token).update("demify-admin-cookie-v1").digest("base64url");
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/**
 * Write protection for the stage and shared networks. When
 * DEMIFY_ADMIN_TOKEN is set, the request must carry the token in the
 * `x-demify-admin` header, or the cookie a browser gets from
 * GET /unlock?token=<token>; otherwise this returns a 401 response for the
 * route to send. When the variable is unset it returns null and nothing
 * changes.
 *
 *   const denied = requireAdmin(req);
 *   if (denied) return denied;
 */
export function requireAdmin(req: Request): Response | null {
  const token = adminToken();
  if (!token) return null;
  if (safeEqual(req.headers.get(ADMIN_HEADER), token)) return null;
  if (safeEqual(readCookie(req.headers.get("cookie"), ADMIN_COOKIE), adminCookieValue(token))) return null;
  return Response.json(
    {
      error: `Admin token required. Open /unlock?token=<token> once in this browser, or send the ${ADMIN_HEADER} header.`,
    },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
