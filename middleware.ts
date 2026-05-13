import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { addSecurityHeaders, enforceSameOrigin } from "@/lib/request-security";
const PUBLIC_FILE = /\.[^/]+$/;

function noStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");
  return addSecurityHeaders(response);
}

function buildExternalUrl(request: NextRequest, path: string) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedPort = request.headers.get("x-forwarded-port");
  const baseHost = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const needsPort =
    forwardedPort &&
    !baseHost.includes(":") &&
    !((proto === "http" && forwardedPort === "80") || (proto === "https" && forwardedPort === "443"));
  const host = needsPort ? `${baseHost}:${forwardedPort}` : baseHost;
  return new URL(path, `${proto}://${host}`);
}

function isStaticOrPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/uploads/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    PUBLIC_FILE.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    const blocked = enforceSameOrigin(request);
    if (blocked) {
      return blocked;
    }
  }

  // Static assets must never be authenticated or redirected.
  // If JS/CSS chunks receive 403, React hydration fails and desktop clicks/forms stop working.
  if (isStaticOrPublicPath(pathname)) {
    return addSecurityHeaders(NextResponse.next());
  }

  const protectedPath =
    pathname.startsWith("/app") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings");

  if (!protectedPath) {
    return noStore(NextResponse.next());
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return noStore(NextResponse.next());
  }

  const callbackUrl = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const loginUrl = buildExternalUrl(
    request,
    `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );
  return noStore(
    NextResponse.redirect(loginUrl),
  );
}

export const config = {
  matcher: [
    "/((?!_next|assets|uploads|favicon.ico|manifest.json|sw.js|.*\\..*).*)",
  ],
};
