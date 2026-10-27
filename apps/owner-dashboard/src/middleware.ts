import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateHostname } from "@departmental/shared-types";

// Explicit trusted proxy list (configured via env or loopback default)
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY_IPS ?? "127.0.0.1,::1")
  .split(",")
  .map((ip) => ip.trim());

// Configurable base domain (defaults to departmentstore.in, overridable via BASE_DOMAIN)
const BASE_DOMAIN = (process.env.BASE_DOMAIN ?? "departmentstore.in").toLowerCase().trim();

// Reserved platform hostnames that serve marketing and platform-admin
const PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "admin.localhost",
  "platform.localhost",
  "departmentstore.in",
  "www.departmentstore.in",
  "admin.departmentstore.in",
  BASE_DOMAIN,
  `www.${BASE_DOMAIN}`,
  `admin.${BASE_DOMAIN}`,
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets, Next.js internal files, favicon are passed through immediately
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg")
  ) {
    return NextResponse.next();
  }

  // 1. Resolve raw host with trusted proxy inspection
  let rawHost = request.headers.get("host") ?? "localhost";
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Trust forwarded-host headers ONLY from specifically configured trusted proxies
  const isTrustedProxy = TRUSTED_PROXIES.some((trusted) => {
    if (trusted === clientIp) return true;
    if (trusted === "127.0.0.1" && (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost")) return true;
    return false;
  });

  if (isTrustedProxy) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedHost) {
      rawHost = forwardedHost.split(",")[0]?.trim() ?? rawHost;
    }
  }

  // Strip port
  const hostnameWithoutPort = rawHost.split(":")[0]?.toLowerCase() ?? "localhost";

  // 2. Validate hostname RFC 1123
  const validation = validateHostname(hostnameWithoutPort);
  if (!validation.valid) {
    return new NextResponse(
      JSON.stringify({ error: "INVALID_HOSTNAME", message: validation.reason || "Invalid hostname" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const normalizedHost = validation.normalized;
  const isPlatformHost = PLATFORM_HOSTS.has(normalizedHost);

  // 3. Platform Host Handling
  if (isPlatformHost) {
    // Normal marketing and platform-admin routes are permitted
    const response = NextResponse.next();
    response.headers.set("X-Tenant-Host", normalizedHost);
    response.headers.set("X-Tenant-Type", "platform");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("Vary", "Host, Cookie");
    return response;
  }

  // 4. Tenant Subdomain Handling (e.g. shop-a.localhost, shop-b.localhost, ramesh.departmentstore.in)
  let candidateSlug: string | null = null;
  const recognizedSuffixes = Array.from(new Set([`.${BASE_DOMAIN}`, ".localhost", ".local", ".departmentstore.in"]));
  for (const base of recognizedSuffixes) {
    if (normalizedHost.endsWith(base)) {
      candidateSlug = normalizedHost.slice(0, -base.length);
      break;
    }
  }

  if (!candidateSlug || candidateSlug.includes(".")) {
    // Malformed multi-level subdomain or unrecognized domain
    return new NextResponse(
      JSON.stringify({
        error: "TENANT_NOT_FOUND",
        message: `No tenant workspace registered for host '${normalizedHost}'`,
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  // SECURITY: Tenant subdomains MUST NOT access platform control plane /admin
  if (pathname.startsWith("/admin")) {
    return new NextResponse(
      JSON.stringify({
        error: "ACCESS_DENIED",
        message: "Platform administration console cannot be accessed from a tenant subdomain",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  // Pass request to tenant workspace with verified tenant context headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-slug", candidateSlug);
  requestHeaders.set("x-tenant-host", normalizedHost);
  requestHeaders.set("x-tenant-type", "store");

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Attach response security & cache isolation headers
  response.headers.set("X-Tenant-Slug", candidateSlug);
  response.headers.set("X-Tenant-Host", normalizedHost);
  response.headers.set("X-Tenant-Type", "store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Vary", "Host, Cookie");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
