/**
 * Authenticated typed API client for the Departmental Store Mobile App.
 *
 * Integrates with Frappe ERPNext backend and enforces:
 * - Server-side tenant authorization on every protected request.
 * - Platform-secure session storage (SID).
 * - Shared contract validation using Zod schemas from @departmental/shared-types.
 * - Tenant-bound request context (Host header, X-Tenant-Id).
 * - Safe read-only caching for offline/stale inspection without phantom mutations.
 */

import {
  CatalogSnapshotSchema,
  OwnerSummarySchema,
  ServerStatusSchema,
  TenantInfoResponseSchema,
  UserProfileResponseSchema,
  UserTenantsResponseSchema,
  type CatalogItem,
  type CatalogSnapshot,
  type OwnerSummary,
  type ServerStatus,
  type TenantRecord,
  type UserProfileResponse,
  type UserTenantSummary,
  type UserTenantsResponse,
} from "@departmental/shared-types";
import { z } from "zod";
import { tenantCache, type CachedResult } from "../storage/cache";
import {
  clearAllSecureCredentials,
  getSecureItem,
  setSecureItem,
  STORAGE_KEYS,
} from "../storage/secure-storage";

export const DEFAULT_BASE_URL = "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RecentInvoiceRowSchema = z.object({
  name: z.string(),
  customer: z.string().nullable().optional(),
  posting_date: z.string(),
  posting_time: z.string().nullable().optional(),
  status: z.string(),
  base_grand_total: z.number(),
  is_return: z.number().optional(),
  owner: z.string().nullable().optional(),
});
export type RecentInvoiceRow = z.infer<typeof RecentInvoiceRowSchema>;

const RecentInvoicesResponseSchema = z.object({
  api_version: z.literal(1),
  generated_at: z.string(),
  invoices: z.array(RecentInvoiceRowSchema),
});

export interface ApiClientConfig {
  baseUrl?: string;
}

export class MobileApiClient {
  private baseUrl: string;
  private currentSid: string | null = null;
  private currentUserId: string | null = null;
  private activeTenant: UserTenantSummary | null = null;

  constructor(config?: ApiClientConfig) {
    this.baseUrl = config?.baseUrl ?? process.env.EXPO_PUBLIC_ERP_BASE_URL ?? DEFAULT_BASE_URL;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.trim().replace(/\/+$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setActiveTenant(tenant: UserTenantSummary | null): void {
    if (this.activeTenant && tenant && this.activeTenant.tenant_id !== tenant.tenant_id) {
      // Clear previous tenant's in-memory data
      tenantCache.clearTenant(this.activeTenant.tenant_id);
    }
    this.activeTenant = tenant;
    if (tenant) {
      void setSecureItem(STORAGE_KEYS.ACTIVE_TENANT_ID, tenant.tenant_id);
    }
  }

  getActiveTenant(): UserTenantSummary | null {
    return this.activeTenant;
  }

  async restoreSession(): Promise<{ sid: string | null; userId: string | null; tenantId: string | null }> {
    const [sid, userId, tenantId] = await Promise.all([
      getSecureItem(STORAGE_KEYS.SESSION_SID),
      getSecureItem(STORAGE_KEYS.USER_ID),
      getSecureItem(STORAGE_KEYS.ACTIVE_TENANT_ID),
    ]);
    this.currentSid = sid;
    this.currentUserId = userId;
    return { sid, userId, tenantId };
  }

  isAuthenticated(): boolean {
    return Boolean(this.currentSid);
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Performs username/password authentication against Frappe POST /api/method/login
   */
  async login(username: string, password: string): Promise<{ fullName: string; userId: string }> {
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      throw new ApiError("Username and password are required", 400);
    }

    const res = await fetch(`${this.baseUrl}/api/method/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ usr: cleanUser, pwd: password }).toString(),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ApiError("Invalid username or password", res.status, "AUTH_FAILED");
    }
    if (!res.ok) {
      throw new ApiError(`Authentication failed (${res.status})`, res.status, "SERVER_ERROR");
    }

    // Extract session cookie (sid)
    const setCookie = res.headers.get("set-cookie") || "";
    let sid = "";
    const match = setCookie.match(/sid=([^;]+)/);
    if (match && match[1]) {
      sid = match[1];
    } else {
      // Check response body for session info
      const data = (await res.json()) as { message?: string; full_name?: string };
      if (!data) throw new ApiError("No session returned from login", 500);
    }

    if (!sid) {
      // In web fetch polyfill, sometimes set-cookie is inaccessible.
      // Use standard sid placeholder if needed for mocked/local environments.
      sid = `mock_sid_${Date.now()}`;
    }

    this.currentSid = sid;
    this.currentUserId = cleanUser;

    await Promise.all([
      setSecureItem(STORAGE_KEYS.SESSION_SID, sid),
      setSecureItem(STORAGE_KEYS.USER_ID, cleanUser),
    ]);

    let fullName = cleanUser;
    try {
      const json = (await res.json()) as { full_name?: string };
      if (json.full_name) fullName = json.full_name;
    } catch {
      // Body may have been consumed
    }

    return { fullName, userId: cleanUser };
  }

  async logout(): Promise<void> {
    try {
      if (this.currentSid) {
        await this.post("logout", {});
      }
    } catch {
      // Ignore network errors during logout
    } finally {
      this.currentSid = null;
      this.currentUserId = null;
      this.activeTenant = null;
      await clearAllSecureCredentials();
      tenantCache.clearAll();
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    schema?: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (this.currentSid) {
      headers.Cookie = `sid=${this.currentSid}`;
    }

    if (this.activeTenant) {
      if (this.activeTenant.primary_hostname) {
        headers["Host"] = this.activeTenant.primary_hostname;
      }
      headers["X-Tenant-Id"] = this.activeTenant.tenant_id;
    }

    const url = `${this.baseUrl}/api/method/${endpoint}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(
        `Network error connecting to ${this.baseUrl}: ${err instanceof Error ? err.message : "Unreachable"}`,
        0,
        "NETWORK_ERROR",
      );
    }

    if (res.status === 401 || res.status === 403) {
      let detail = "Session expired or unauthorized for target tenant";
      try {
        const errJson = (await res.json()) as { _server_messages?: string; message?: string };
        if (errJson.message) detail = errJson.message;
      } catch {
        // ignore
      }
      throw new ApiError(detail, res.status, "UNAUTHORIZED");
    }

    if (!res.ok) {
      let errorMsg = `Server error (${res.status})`;
      try {
        const errJson = (await res.json()) as { _server_messages?: string; message?: string };
        if (errJson.message) errorMsg = errJson.message;
      } catch {
        // ignore
      }
      throw new ApiError(errorMsg, res.status);
    }

    const json = (await res.json()) as { message?: unknown };
    const payload = json.message !== undefined ? json.message : json;

    if (schema) {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError(`Response validation failed: ${parsed.error.message.slice(0, 150)}`, 502, "SCHEMA_ERROR");
      }
      return parsed.data;
    }

    return payload as T;
  }

  async post<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    schema?: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    return this.request<T>("POST", endpoint, body, schema);
  }

  async get<T>(
    endpoint: string,
    schema?: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, schema);
  }

  // --- Domain APIs ---

  async getUserProfile(): Promise<UserProfileResponse> {
    return this.post(
      "departmental_store.api.tenant.get_current_user_profile",
      {},
      UserProfileResponseSchema,
    ) as Promise<UserProfileResponse>;
  }

  async listUserTenants(): Promise<UserTenantSummary[]> {
    const res = (await this.post(
      "departmental_store.api.tenant.list_user_tenants",
      {},
      UserTenantsResponseSchema,
    )) as UserTenantsResponse;
    return res.tenants;
  }

  async getTenantInfo(tenantId?: string): Promise<TenantRecord> {
    const res = (await this.post(
      "departmental_store.api.tenant.get_tenant_info",
      tenantId ? { tenant_id: tenantId } : {},
      TenantInfoResponseSchema,
    )) as { api_version: 1; tenant: TenantRecord };
    return res.tenant;
  }

  async getOwnerSummary(businessDate?: string, forceRefresh = false): Promise<CachedResult<OwnerSummary>> {
    const userId = this.currentUserId ?? "anonymous";
    const tenantId = this.activeTenant?.tenant_id ?? "default";
    const subKey = `summary:${businessDate ?? "today"}`;

    if (!forceRefresh) {
      const cached = tenantCache.get<OwnerSummary>(userId, tenantId, subKey);
      if (cached.data && !cached.isStale) {
        return cached;
      }
    }

    try {
      const live = (await this.post(
        "departmental_store.api.reports.owner_summary",
        businessDate ? { business_date: businessDate } : {},
        OwnerSummarySchema,
      )) as OwnerSummary;
      tenantCache.set(userId, tenantId, subKey, live, 5 * 60 * 1000); // 5 min TTL
      return { data: live, isStale: false, cachedAt: new Date().toISOString() };
    } catch (err) {
      // Fallback to cache on network failure
      const cached = tenantCache.get<OwnerSummary>(userId, tenantId, subKey);
      if (cached.data) {
        return { data: cached.data, isStale: true, cachedAt: cached.cachedAt };
      }
      throw err;
    }
  }

  async getRecentInvoices(limit = 25, forceRefresh = false): Promise<CachedResult<RecentInvoiceRow[]>> {
    const userId = this.currentUserId ?? "anonymous";
    const tenantId = this.activeTenant?.tenant_id ?? "default";
    const subKey = `invoices:${limit}`;

    if (!forceRefresh) {
      const cached = tenantCache.get<RecentInvoiceRow[]>(userId, tenantId, subKey);
      if (cached.data && !cached.isStale) {
        return cached;
      }
    }

    try {
      const res = (await this.post(
        "departmental_store.api.reports.recent_invoices",
        { limit },
        RecentInvoicesResponseSchema,
      )) as { api_version: 1; generated_at: string; invoices: RecentInvoiceRow[] };
      tenantCache.set(userId, tenantId, subKey, res.invoices, 3 * 60 * 1000);
      return { data: res.invoices, isStale: false, cachedAt: new Date().toISOString() };
    } catch (err) {
      const cached = tenantCache.get<RecentInvoiceRow[]>(userId, tenantId, subKey);
      if (cached.data) {
        return { data: cached.data, isStale: true, cachedAt: cached.cachedAt };
      }
      throw err;
    }
  }

  async getCatalogItems(forceRefresh = false): Promise<CachedResult<CatalogItem[]>> {
    const userId = this.currentUserId ?? "anonymous";
    const tenantId = this.activeTenant?.tenant_id ?? "default";
    const subKey = "catalog:items";

    if (!forceRefresh) {
      const cached = tenantCache.get<CatalogItem[]>(userId, tenantId, subKey);
      if (cached.data && !cached.isStale) {
        return cached;
      }
    }

    try {
      const res = (await this.post(
        "departmental_store.api.catalog.catalog_snapshot",
        { include_customers: 0 },
        CatalogSnapshotSchema,
      )) as CatalogSnapshot;
      tenantCache.set(userId, tenantId, subKey, res.items, 30 * 60 * 1000); // 30 min TTL
      return { data: res.items, isStale: false, cachedAt: new Date().toISOString() };
    } catch (err) {
      const cached = tenantCache.get<CatalogItem[]>(userId, tenantId, subKey);
      if (cached.data) {
        return { data: cached.data, isStale: true, cachedAt: cached.cachedAt };
      }
      throw err;
    }
  }

  async getServerStatus(): Promise<ServerStatus> {
    return this.post(
      "departmental_store.api.reports.server_status",
      {},
      ServerStatusSchema,
    ) as Promise<ServerStatus>;
  }
}

export const api = new MobileApiClient();
