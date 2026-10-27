import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function createMockRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  const reqHeaders = new Headers(headers);
  if (!reqHeaders.has("host")) {
    const parsed = new URL(url);
    reqHeaders.set("host", parsed.host);
  }
  return new NextRequest(url, { headers: reqHeaders });
}

describe("Next.js Middleware Subdomain Resolution & Boundary", () => {
  it("routes platform host to platform context", () => {
    const req = createMockRequest("http://localhost:3100/", { host: "localhost:3100" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Type")).toBe("platform");
    expect(res.headers.get("X-Tenant-Host")).toBe("localhost");
  });

  it("routes tenant subdomain to store context and injects tenant slug", () => {
    const req = createMockRequest("http://shop-a.localhost:3100/app", { host: "shop-a.localhost:3100" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Slug")).toBe("shop-a");
    expect(res.headers.get("X-Tenant-Type")).toBe("store");
    expect(res.headers.get("Vary")).toBe("Host, Cookie");
  });

  it("rejects tenant subdomain attempting to access /admin with 403 Forbidden", async () => {
    const req = createMockRequest("http://shop-a.localhost:3100/admin/onboarding", { host: "shop-a.localhost:3100" });
    const res = middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCESS_DENIED");
  });

  it("permits platform host to access /admin/onboarding", () => {
    const req = createMockRequest("http://localhost:3100/admin/onboarding", { host: "localhost:3100" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Type")).toBe("platform");
  });

  it("rejects malformed hostnames with 400 Bad Request", async () => {
    const req = createMockRequest("http://localhost:3100/", { host: "bad;injection/domain" });
    const res = middleware(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_HOSTNAME");
  });

  it("rejects multi-level or unrecognized subdomains with 404", async () => {
    const req = createMockRequest("http://invalid.extra.localhost:3100/", { host: "invalid.extra.localhost:3100" });
    const res = middleware(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("TENANT_NOT_FOUND");
  });

  it("ignores x-forwarded-host from untrusted client IP", () => {
    const req = createMockRequest("http://localhost:3100/", {
      host: "localhost:3100",
      "x-forwarded-for": "203.0.113.195", // Public untrusted IP
      "x-forwarded-host": "attacker-spoofed.localhost",
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Type")).toBe("platform");
    expect(res.headers.get("X-Tenant-Host")).toBe("localhost");
  });

  it("honors x-forwarded-host from trusted proxy peer IP", () => {
    const req = createMockRequest("http://127.0.0.1:3100/app", {
      host: "127.0.0.1:3100",
      "x-forwarded-for": "127.0.0.1", // Loopback trusted proxy
      "x-forwarded-host": "shop-b.localhost",
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Slug")).toBe("shop-b");
    expect(res.headers.get("X-Tenant-Type")).toBe("store");
  });

  it("routes apex domain departmentstore.in to platform context", () => {
    const req = createMockRequest("https://departmentstore.in/", { host: "departmentstore.in" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Type")).toBe("platform");
    expect(res.headers.get("X-Tenant-Host")).toBe("departmentstore.in");
  });

  it("routes admin.departmentstore.in to platform context and allows /admin", () => {
    const req = createMockRequest("https://admin.departmentstore.in/admin/onboarding", { host: "admin.departmentstore.in" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Type")).toBe("platform");
  });

  it("routes tenant subdomain on departmentstore.in to store context", () => {
    const req = createMockRequest("https://shop-alpha.departmentstore.in/app", { host: "shop-alpha.departmentstore.in" });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Tenant-Slug")).toBe("shop-alpha");
    expect(res.headers.get("X-Tenant-Type")).toBe("store");
  });
});
