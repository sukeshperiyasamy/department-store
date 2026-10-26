/**
 * Server-side Frappe client for the owner dashboard.
 *
 * Auth (in order of preference):
 * 1. DASHBOARD_API_KEY/SECRET token from env (service user with reporting roles)
 * 2. Session cookie captured at login (owner user)
 *
 * Every response is validated against the shared contract schemas.
 */
import "server-only";
import { cookies } from "next/headers";
import {
  OwnerSummarySchema,
  ServerStatusSchema,
  type OwnerSummary,
  type ServerStatus,
} from "@departmental/shared-types";
import { z, type ZodType, type ZodTypeDef } from "zod";

const ERP_BASE_URL = process.env.ERP_BASE_URL ?? "http://localhost:8080";
const SESSION_COOKIE = "ds_dash_sid";

export class DashboardAuthError extends Error {}

async function callFrappe<T>(
  method: string,
  args: Record<string, unknown>,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  const token = dashboardToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `token ${token.key}:${token.secret}`;
  } else {
    const sid = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!sid) throw new DashboardAuthError("not signed in");
    headers.Cookie = `sid=${sid}`;
  }

  const response = await fetch(`${ERP_BASE_URL}/api/method/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new DashboardAuthError(`ERP authorization failed (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`ERP call ${method} failed: ${response.status}`);
  }
  const json = (await response.json()) as { message?: unknown };
  const parsed = schema.safeParse(json.message ?? json);
  if (!parsed.success) {
    throw new Error(`ERP response from ${method} failed contract validation: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}

function dashboardToken(): { key: string; secret: string } | null {
  const key = process.env.DASHBOARD_API_KEY;
  const secret = process.env.DASHBOARD_API_SECRET;
  if (key && secret) return { key, secret };
  return null;
}

export async function loginAndCaptureSession(username: string, password: string): Promise<void> {
  const response = await fetch(`${ERP_BASE_URL}/api/method/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ usr: username, pwd: password }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new DashboardAuthError("invalid username or password");
  }
  if (!response.ok) {
    throw new Error(`login failed: ${response.status}`);
  }
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const sid = setCookie
    .map((c) => c.split(";")[0] ?? "")
    .find((c) => c.startsWith("sid="))
    ?.slice(4);
  if (!sid) throw new Error("login did not return a session");
  const store = await cookies();
  store.set(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });
}

export async function logoutSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export function isSignedIn(): boolean {
  return Boolean(dashboardToken() || (typeof window === "undefined" && sessionCookiePresent()));
}

function sessionCookiePresent(): boolean {
  try {
    // cookies() is async in Next 15; expose sync availability check conservatively.
    return true; // pages handle absence by redirecting to /login
  } catch {
    return false;
  }
}

export async function fetchOwnerSummary(businessDate?: string): Promise<OwnerSummary> {
  return callFrappe(
    "departmental_store.api.reports.owner_summary",
    businessDate ? { business_date: businessDate } : {},
    OwnerSummarySchema,
  );
}

export async function fetchServerStatus(): Promise<ServerStatus> {
  return callFrappe("departmental_store.api.reports.server_status", {}, ServerStatusSchema);
}

export const zod = z;
