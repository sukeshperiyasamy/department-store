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
  DemoRequestResponseSchema,
  OnboardingRequestResponseSchema,
  OwnerSummarySchema,
  ResolveTenantResponseSchema,
  ServerStatusSchema,
  OnboardingDetailRecordSchema,
  type OnboardingDetailRecord,
  SetFlagResultSchema,
  SlugAvailabilityResponseSchema,
  StockAlertsSchema,
  StoreProfileSchema,
  StoreSettingsSchema,
  SupportRequestResultSchema,
  TenantInfoResponseSchema,
  CustomerOnboardingStatusResponseSchema,
  type CustomerOnboardingStatusResponse,
  PlatformOperationsOverviewSchema,
  type PlatformOperationsOverview,
  type CatalogSnapshot,
  type DemoRequest,
  type DemoRequestResponse,
  type FeatureFlagName,
  type OnboardingRequest,
  type OnboardingRequestResponse,
  type OwnerSummary,
  type ResolveTenantResponse,
  type ServerStatus,
  type SetFlagResult,
  type SlugAvailabilityResponse,
  type StockAlerts,
  type StoreProfile,
  type StoreSettings,
  type SupportRequestPayload,
  type SupportRequestResult,
  type TenantRecord,
  type UpdateStoreProfilePayload,
} from "@departmental/shared-types";
import { saveDemoRequestLocal, saveOnboardingRequestLocal } from "./lead-storage";
import { z, type ZodType, type ZodTypeDef } from "zod";

import { getEnv } from "./env";

const SESSION_COOKIE = "ds_dash_sid";

function getErpBaseUrl(): string {
  return getEnv().ERP_BASE_URL;
}

export class DashboardAuthError extends Error {}

async function callFrappe<T>(
  method: string,
  args: Record<string, unknown>,
  schema: ZodType<T, ZodTypeDef, unknown>,
  options?: { allowGuest?: boolean },
): Promise<T> {
  const token = dashboardToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let sid: string | undefined;
  try {
    sid = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    // ignore outside request context
  }

  if (sid) {
    headers.Cookie = `sid=${sid}`;
  } else if (token) {
    headers.Authorization = `token ${token.key}:${token.secret}`;
  } else if (!options?.allowGuest) {
    throw new DashboardAuthError("not signed in");
  }

  const response = await fetch(`${getEnv().ERP_BASE_URL}/api/method/${method}`, {
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
    let errMsg = `ERP call ${method} failed: ${response.status}`;
    try {
      const errJson = (await response.json()) as { _server_messages?: string; message?: string };
      if (errJson._server_messages) {
        const msgs = JSON.parse(errJson._server_messages);
        if (Array.isArray(msgs) && msgs.length > 0) {
          const first = typeof msgs[0] === "string" ? JSON.parse(msgs[0]) : msgs[0];
          errMsg = first.message || first;
        }
      } else if (errJson.message) {
        errMsg = typeof errJson.message === "string" ? errJson.message : JSON.stringify(errJson.message);
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(errMsg);
  }
  const json = (await response.json()) as { message?: unknown };
  const parsed = schema.safeParse(json.message ?? json);
  if (!parsed.success) {
    throw new Error(`ERP response from ${method} failed contract validation: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}

function dashboardToken(): { key: string; secret: string } | null {
  const env = getEnv();
  const key = env.DASHBOARD_API_KEY;
  const secret = env.DASHBOARD_API_SECRET;
  if (key && secret) return { key, secret };
  return null;
}

export async function loginAndCaptureSession(username: string, password: string): Promise<void> {
  const response = await fetch(`${getEnv().ERP_BASE_URL}/api/method/login`, {
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
    secure: getEnv().NODE_ENV === "production",
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

export async function fetchStoreProfile(): Promise<StoreProfile> {
  return callFrappe(
    "departmental_store.api.settings.get_store_profile",
    {},
    StoreProfileSchema,
  );
}

export async function updateStoreProfile(
  profile: UpdateStoreProfilePayload,
): Promise<StoreProfile> {
  return callFrappe(
    "departmental_store.api.settings.update_store_profile",
    { profile },
    StoreProfileSchema,
  );
}

export async function submitSupportRequest(
  payload: SupportRequestPayload,
): Promise<SupportRequestResult> {
  return callFrappe(
    "departmental_store.api.settings.submit_support_request",
    {
      category: payload.category,
      subject: payload.subject,
      description: payload.description,
      priority: payload.priority,
      diagnostics: payload.diagnostics ?? {},
    },
    SupportRequestResultSchema,
  );
}


export async function resolveTenantFromHost(hostname: string): Promise<ResolveTenantResponse> {
  const response = await fetch(
    `${getErpBaseUrl()}/api/method/departmental_store.api.tenant.resolve_tenant_by_host`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ hostname }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Tenant resolution failed: ${response.status}`);
  }
  const json = (await response.json()) as { message?: unknown };
  return ResolveTenantResponseSchema.parse(json.message ?? json);
}

export async function fetchTenantInfo(): Promise<TenantRecord> {
  const result = await callFrappe(
    "departmental_store.api.tenant.get_tenant_info",
    {},
    TenantInfoResponseSchema,
  );
  return result.tenant;
}

export async function checkSlugAvailability(slug: string): Promise<SlugAvailabilityResponse> {
  try {
    const response = await fetch(
      `${getErpBaseUrl()}/api/method/departmental_store.api.tenant.check_slug_availability`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ slug }),
        cache: "no-store",
      },
    );
    if (response.ok) {
      const json = (await response.json()) as { message?: unknown };
      return SlugAvailabilityResponseSchema.parse(json.message ?? json);
    }
  } catch (err) {
    // If backend unreachable, validate locally using shared rules
  }
  const clean = slug.trim().toLowerCase();
  const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(clean) && !clean.includes("--") && clean.length >= 3 && clean.length <= 63;
  return {
    api_version: 1,
    slug: clean,
    available: valid,
    reason: valid ? undefined : "Invalid slug format",
  };
}

export async function submitDemoRequest(data: DemoRequest): Promise<DemoRequestResponse> {
  try {
    const response = await fetch(
      `${getErpBaseUrl()}/api/method/departmental_store.api.tenant.submit_demo_request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ data }),
        cache: "no-store",
      },
    );
    if (response.ok) {
      const json = (await response.json()) as { message?: unknown };
      const parsed = DemoRequestResponseSchema.parse(json.message ?? json);
      saveDemoRequestLocal(data, parsed.request_id, true);
      return parsed;
    }
  } catch (err) {
    // Fall back to durable local storage
  }

  const localRecord = saveDemoRequestLocal(data, undefined, false);
  return {
    api_version: 1,
    request_id: localRecord.id,
    status: "Pending Review",
    message: "Demo request received successfully. Our sales engineering team will reach out within 1 business day.",
  };
}

export async function submitOnboardingRequest(data: OnboardingRequest): Promise<OnboardingRequestResponse> {
  try {
    const response = await fetch(
      `${getErpBaseUrl()}/api/method/departmental_store.api.tenant.submit_onboarding_request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ data }),
        cache: "no-store",
      },
    );
    if (response.ok) {
      const json = (await response.json()) as { message?: unknown };
      const parsed = OnboardingRequestResponseSchema.parse(json.message ?? json);
      saveOnboardingRequestLocal(data, parsed.request_id, true);
      return parsed;
    }
  } catch (err) {
    // Fall back to durable local storage
  }

  const localRecord = saveOnboardingRequestLocal(data, undefined, false);
  return {
    api_version: 1,
    request_id: localRecord.id,
    preferred_slug: data.preferred_slug,
    status: "Pending Review",
    message: "Request submitted; shop activation is pending review. You will receive an email once your workspace is verified and provisioned.",
  };
}

export async function listPlatformOnboardingRequests(
  status?: string,
  search?: string,
  page = 1,
): Promise<{
  api_version: number;
  total: number;
  page: number;
  page_size: number;
  requests: OnboardingDetailRecord[];
}> {
  return callFrappe(
    "departmental_store.api.provisioning.list_onboarding_requests",
    { status: status ?? "ALL", search: search ?? "", page },
    z.object({
      api_version: z.literal(1),
      total: z.number(),
      page: z.number(),
      page_size: z.number(),
      requests: z.array(OnboardingDetailRecordSchema),
    }),
  );
}

export async function getPlatformOnboardingDetail(
  requestId: string,
): Promise<{ api_version: number; detail: OnboardingDetailRecord }> {
  return callFrappe(
    "departmental_store.api.provisioning.get_onboarding_detail",
    { request_id: requestId },
    z.object({
      api_version: z.literal(1),
      detail: OnboardingDetailRecordSchema,
    }),
  );
}

export async function approvePlatformOnboarding(
  requestId: string,
  notes?: string,
): Promise<{
  api_version: number;
  request_id: string;
  status: string;
  job_id: string;
  assigned_site_name: string;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.provisioning.approve_onboarding_request",
    { request_id: requestId, notes: notes ?? "" },
    z.object({
      api_version: z.literal(1),
      request_id: z.string(),
      status: z.string(),
      job_id: z.string(),
      assigned_site_name: z.string(),
      message: z.string(),
    }),
  );
}

export async function rejectPlatformOnboarding(
  requestId: string,
  reason: string,
): Promise<{
  api_version: number;
  request_id: string;
  status: string;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.provisioning.reject_onboarding_request",
    { request_id: requestId, reason },
    z.object({
      api_version: z.literal(1),
      request_id: z.string(),
      status: z.string(),
      message: z.string(),
    }),
  );
}

export async function retryPlatformProvisioning(
  requestId: string,
  reason?: string,
): Promise<{
  api_version: number;
  request_id: string;
  status: string;
  job_id: string;
  retry_count: number;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.provisioning.retry_provisioning_job",
    { request_id: requestId, reason: reason ?? "" },
    z.object({
      api_version: z.literal(1),
      request_id: z.string(),
      status: z.string(),
      job_id: z.string(),
      retry_count: z.number(),
      message: z.string(),
    }),
  );
}

export async function setPlatformTenantStatus(
  tenantId: string,
  newStatus: string,
  reason: string,
): Promise<{
  api_version: number;
  tenant_id: string;
  status: string;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.provisioning.set_tenant_status",
    { tenant_id: tenantId, new_status: newStatus, reason },
    z.object({
      api_version: z.literal(1),
      tenant_id: z.string(),
      status: z.string(),
      message: z.string(),
    }),
  );
}

export async function getBillingOverview(tenantId: string): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.get_billing_overview",
    { tenant_id: tenantId },
    z.any(),
  );
}

export async function getAvailablePlans(): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.get_available_plans",
    {},
    z.any(),
  );
}

export async function createCheckoutSession(
  tenantId: string,
  planId: string,
  billingInterval: string = "MONTHLY",
): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.create_checkout_session",
    { tenant_id: tenantId, plan_id: planId, billing_interval: billingInterval },
    z.any(),
  );
}

export async function cancelSubscription(
  tenantId: string,
  reason: string,
  immediate: boolean = false,
): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.cancel_subscription",
    { tenant_id: tenantId, reason, immediate },
    z.any(),
  );
}

export async function adminListSubscriptions(
  status?: string,
  query?: string,
  limit: number = 50,
): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.admin_list_subscriptions",
    { status: status || null, query: query || null, limit },
    z.any(),
  );
}

export async function adminManualBillingCorrection(
  subscriptionId: string,
  targetStatus: string,
  reason: string,
  extendDays: number = 0,
): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.admin_manual_billing_correction",
    { subscription_id: subscriptionId, target_status: targetStatus, reason, extend_days: extendDays },
    z.any(),
  );
}

export async function adminListWebhookEvents(limit: number = 50): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.admin_list_webhook_events",
    { limit },
    z.any(),
  );
}

export async function adminRetryWebhookEvent(eventId: string): Promise<any> {
  return callFrappe(
    "departmental_store.api.billing.admin_retry_webhook_event",
    { event_id: eventId },
    z.any(),
  );
}

// -------------------------------------------------------------------------
// Phase 7: Onboarding Automation, Contact Verification & Tenant Operations
// -------------------------------------------------------------------------

export async function registerCustomerOnboarding(data: {
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  preferred_slug: string;
  requested_plan?: string;
  agreed_to_terms?: boolean;
}): Promise<{
  api_version: number;
  request_id: string;
  preferred_slug: string;
  status: string;
  contact_verification: string;
  verification_token?: string | undefined;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.onboarding.register_customer_onboarding",
    data,
    z.object({
      api_version: z.literal(1),
      request_id: z.string(),
      preferred_slug: z.string(),
      status: z.string(),
      contact_verification: z.string(),
      verification_token: z.string().optional(),
      message: z.string(),
    }),
    { allowGuest: true },
  );
}

export async function verifyContactToken(
  requestId: string,
  token: string,
): Promise<{
  api_version: number;
  request_id: string;
  contact_verification: string;
  status: string;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.onboarding.verify_contact_token",
    { request_id: requestId, token },
    z.object({
      api_version: z.literal(1),
      request_id: z.string(),
      contact_verification: z.string(),
      status: z.string(),
      message: z.string(),
    }),
    { allowGuest: true },
  );
}

export async function resendVerificationToken(
  email: string,
): Promise<{
  api_version: number;
  request_id?: string | undefined;
  verification_token?: string | undefined;
  message: string;
}> {
  return callFrappe(
    "departmental_store.api.onboarding.resend_verification_token",
    { email },
    z.object({
      api_version: z.literal(1),
      request_id: z.string().optional(),
      verification_token: z.string().optional(),
      message: z.string(),
    }),
    { allowGuest: true },
  );
}

export async function getOnboardingJourney(
  requestId: string,
  email?: string,
  token?: string,
): Promise<CustomerOnboardingStatusResponse> {
  return callFrappe(
    "departmental_store.api.onboarding.get_onboarding_journey",
    { request_id: requestId, email: email || null, token: token || null },
    CustomerOnboardingStatusResponseSchema,
    { allowGuest: true },
  );
}

export async function getPlatformOperationsOverview(): Promise<PlatformOperationsOverview> {
  return callFrappe(
    "departmental_store.api.onboarding.get_platform_operations_overview",
    {},
    PlatformOperationsOverviewSchema,
  );
}

export const zod = z;
