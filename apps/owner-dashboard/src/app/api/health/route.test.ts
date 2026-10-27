import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

describe("Dashboard Health API Route (/api/health)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ERP_BASE_URL", "http://localhost:8080");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns 200 OK when ERP is healthy", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: { status: "ok" } }),
    } as Response);

    const request = new Request("http://localhost:3100/api/health", {
      headers: { "x-correlation-id": "test-corr-123" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.service).toBe("owner-dashboard");
    expect(json.correlation_id).toBe("test-corr-123");
    expect(json.dependencies.erp.status).toBe("healthy");
  });

  it("returns 503 degraded when ERP is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const request = new Request("http://localhost:3100/api/health");
    const response = await GET(request);
    expect(response.status).toBe(503);

    const json = await response.json();
    expect(json.status).toBe("degraded");
    expect(json.dependencies.erp.status).toBe("unreachable");
  });
});
