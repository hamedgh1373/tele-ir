import { NextResponse, type NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return response;
}

function normalizeOriginCandidate(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getExpectedOrigin(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedPort = request.headers.get("x-forwarded-port");
  const baseHost = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const needsPort =
    forwardedPort &&
    !baseHost.includes(":") &&
    !((proto === "http" && forwardedPort === "80") || (proto === "https" && forwardedPort === "443"));
  const host = needsPort ? `${baseHost}:${forwardedPort}` : baseHost;
  if (!host) return null;
  return `${proto}://${host}`;
}

export function enforceSameOrigin(request: NextRequest) {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const expectedOrigin = getExpectedOrigin(request);
  const requestOrigin =
    normalizeOriginCandidate(request.headers.get("origin")) ||
    normalizeOriginCandidate(request.headers.get("referer"));

  if (!expectedOrigin || !requestOrigin || requestOrigin !== expectedOrigin) {
    return addSecurityHeaders(
      NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    );
  }

  return null;
}
