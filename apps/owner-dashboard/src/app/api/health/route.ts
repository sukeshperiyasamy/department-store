import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || crypto.randomUUID();
  const env = getEnv();

  let erpStatus: "healthy" | "unreachable" | "degraded" = "unreachable";
  let erpLatencyMs: number | null = null;
  let erpTelemetry: unknown = null;

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const isAuthorized = env.HEALTH_CHECK_TOKEN && token === env.HEALTH_CHECK_TOKEN;

  const start = performance.now();
  try {
    const erpUrl = `${env.ERP_BASE_URL}/api/method/departmental_store.api.health.get_liveness`;
    const res = await fetch(erpUrl, {
      method: "GET",
      headers: { "X-Correlation-ID": correlationId },
      cache: "no-store",
    });
    erpLatencyMs = Math.round(performance.now() - start);

    if (res.ok) {
      erpStatus = "healthy";

      // If authorized with health token, retrieve full system health telemetry
      if (isAuthorized) {
        const detailRes = await fetch(
          `${env.ERP_BASE_URL}/api/method/departmental_store.api.health.get_system_health`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Health-Check-Token": token,
              "X-Correlation-ID": correlationId,
            },
            cache: "no-store",
          }
        );
        if (detailRes.ok) {
          const detailJson = (await detailRes.json()) as { message?: unknown };
          erpTelemetry = detailJson.message ?? detailJson;
        }
      }
    } else {
      erpStatus = "degraded";
    }
  } catch {
    erpStatus = "unreachable";
    erpLatencyMs = Math.round(performance.now() - start);
  }

  const memoryUsage = process.memoryUsage ? process.memoryUsage() : null;
  const isDegraded = erpStatus === "unreachable";

  const payload = {
    status: isDegraded ? "degraded" : "ok",
    service: "owner-dashboard",
    uptime_seconds: Math.round(process.uptime()),
    correlation_id: correlationId,
    timestamp: new Date().toISOString(),
    dependencies: {
      erp: {
        status: erpStatus,
        latency_ms: erpLatencyMs,
        ...(isAuthorized && erpTelemetry ? { telemetry: erpTelemetry } : {}),
      },
    },
    ...(isAuthorized && memoryUsage
      ? {
          memory: {
            rss_mb: Math.round(memoryUsage.rss / (1024 * 1024)),
            heap_used_mb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
          },
        }
      : {}),
  };

  return NextResponse.json(payload, {
    status: isDegraded ? 503 : 200,
    headers: {
      "X-Correlation-ID": correlationId,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
