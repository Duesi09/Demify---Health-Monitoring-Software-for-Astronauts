import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE_S,
  adminCookieValue,
  adminToken,
  safeEqual,
} from "@/lib/http";

export const dynamic = "force-dynamic";

/** True when the browser reached us over HTTPS (directly or through a TLS proxy). */
function overHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  return forwarded ? forwarded === "https" : new URL(req.url).protocol === "https:";
}

/**
 * GET /unlock?token=<DEMIFY_ADMIN_TOKEN>
 *
 * Unlocks this browser for the write APIs (drills, sensor readings) when an
 * admin token is configured: compares the token in constant time, sets an
 * httpOnly SameSite=Strict cookie and redirects to the overview, which also
 * drops the token from the address bar. Without a configured token there is
 * nothing to unlock and it just redirects.
 */
export async function GET(req: Request) {
  const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  const token = adminToken();
  if (!token) return new Response(null, { status: 303, headers: { ...noStore, Location: "/" } });

  const candidate = new URL(req.url).searchParams.get("token");
  if (!safeEqual(candidate, token)) {
    return Response.json({ error: "Wrong or missing admin token" }, { status: 401, headers: noStore });
  }

  const cookie = [
    `${ADMIN_COOKIE}=${adminCookieValue(token)}`,
    "Path=/",
    `Max-Age=${ADMIN_COOKIE_MAX_AGE_S}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(overHttps(req) ? ["Secure"] : []),
  ].join("; ");
  return new Response(null, { status: 303, headers: { ...noStore, Location: "/", "Set-Cookie": cookie } });
}
