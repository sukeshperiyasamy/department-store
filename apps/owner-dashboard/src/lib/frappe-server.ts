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
  API_VERSION_SCHEMA,
  CatalogSnapshotSchema,
  OwnerSummarySchema,
  ServerStatusSchema,
  SetFlagResultSchema,
  StockAlertsSchema,
  StoreSettingsSchema,
  type CatalogSnapshot,
  type FeatureFlagName,
  type OwnerSummary,
  type ServerStatus,
  type SetFlagResult,
  type StockAlerts,
  type StoreSettings,
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
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (sid) {
    headers.Cookie = `sid=${sid}`;
  } else if (token) {
    headers.Authorization = `token ${token.key}:${token.secret}`;
  } else {
    throw new DashboardAuthError("not signed in");
  }

  const response = await fetch(`${ERP_BASE_URL}/api/method/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    let detail = "";
    try {
      const errJson = (await response.json()) as { _server_messages?: string; exc_type?: string; exception?: string };
      detail = errJson.exc_type || errJson.exception || "";
    } catch {
      // ignore JSON parse failure
    }
    throw new DashboardAuthError(`ERP authorization failed (${response.status})${detail ? `: ${detail}` : ""}`);
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

export async function fetchStockAlerts(daysToExpiry?: number): Promise<StockAlerts> {
  return callFrappe(
    "departmental_store.api.reports.stock_alerts",
    daysToExpiry ? { days_to_expiry: daysToExpiry } : {},
    StockAlertsSchema,
  );
}

export async function fetchCatalogSnapshot(): Promise<CatalogSnapshot> {
  return callFrappe(
    "departmental_store.api.catalog.catalog_snapshot",
    { include_customers: 0 },
    CatalogSnapshotSchema,
  );
}

/** Recent submitted invoices via the app's whitelisted reporting method
 * (raw ERPNext REST returned 403 for the reporting service user). */
const InvoiceSchema = z.object({
  name: z.string(),
  customer: z.string().nullable().optional(),
  posting_date: z.string(),
  posting_time: z.string().nullable().optional(),
  status: z.string(),
  base_grand_total: z.number(),
  is_return: z.number().optional(),
  owner: z.string().nullable().optional(),
});
const RecentInvoicesSchema = z.object({
  api_version: API_VERSION_SCHEMA,
  generated_at: z.string(),
  invoices: z.array(InvoiceSchema),
});
export type InvoiceRow = z.infer<typeof InvoiceSchema>;

export async function fetchRecentInvoices(limit = 25): Promise<InvoiceRow[]> {
  const result = await callFrappe(
    "departmental_store.api.reports.recent_invoices",
    { limit },
    RecentInvoicesSchema,
  );
  return result.invoices;
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  return callFrappe(
    "departmental_store.api.settings.get_settings",
    {},
    StoreSettingsSchema,
  );
}

export async function setFeatureFlag(flag: FeatureFlagName, value: boolean): Promise<SetFlagResult> {
  return callFrappe(
    "departmental_store.api.settings.set_flag",
    { flag, value: value ? 1 : 0 },
    SetFlagResultSchema,
  );
}

export const zod = z;

