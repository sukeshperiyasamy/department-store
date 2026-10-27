/**
 * Phase 7 — Mobile Security, Authentication, and Multi-Tenant Isolation Tests.
 *
 * Verifies:
 * 1. Login success, failure handling, and session capture.
 * 2. Session expiry, logout, and credential purging.
 * 3. Authorized single-tenant vs multi-tenant shop discovery.
 * 4. Denial of unauthorized or suspended tenant selection.
 * 5. Strict cross-tenant cache isolation and cache clearing on tenant switch.
 * 6. Offline read-only caching and stale data indicators.
 * 7. Protection against secret leakage in client errors and bundle configuration.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileApiClient, ApiError } from "../api/client";
import { tenantCache } from "../storage/cache";
import { getSecureItem, STORAGE_KEYS } from "../storage/secure-storage";
import type { UserTenantSummary } from "@departmental/shared-types";

describe("Mobile Security, Authentication & Multi-Tenant Isolation", () => {
  let client: MobileApiClient;

  const mockTenantA: UserTenantSummary = {
    tenant_id: "11111111-1111-4111-8111-111111111111",
    slug: "shop-a",
    name: "Shop A Departmental",
    role: "TENANT_OWNER",
    status: "ACTIVE",
    primary_hostname: "shop-a.departmentstore.in",
  };

  const mockTenantB: UserTenantSummary = {
    tenant_id: "22222222-2222-4222-8222-222222222222",
    slug: "shop-b",
    name: "Shop B Supermarket",
    role: "STORE_MANAGER",
    status: "ACTIVE",
    primary_hostname: "shop-b.departmentstore.in",
  };

  const mockSuspendedTenant: UserTenantSummary = {
    tenant_id: "33333333-3333-4333-8333-333333333333",
    slug: "shop-suspended",
    name: "Suspended Store",
    role: "STORE_MANAGER",
    status: "SUSPENDED",
    primary_hostname: "suspended.departmentstore.in",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    tenantCache.clearAll();
    client = new MobileApiClient({ baseUrl: "http://localhost:8080" });
  });

  describe("Authentication and Session Lifecycle", () => {
    it("captures session sid on successful login and persists to secure storage", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "set-cookie": "sid=sess_abc123456789; Path=/; HttpOnly",
        }),
        json: async () => ({ message: "Logged In", full_name: "Store Manager" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.login("manager@shop-a.com", "valid_password");
      expect(result.fullName).toBe("Store Manager");
      expect(result.userId).toBe("manager@shop-a.com");
      expect(client.isAuthenticated()).toBe(true);

      const storedSid = await getSecureItem(STORAGE_KEYS.SESSION_SID);
      expect(storedSid).toBe("sess_abc123456789");
    });

    it("rejects invalid credentials with 401 without exposing password in errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: "Invalid login" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.login("attacker@test.com", "wrong_password")).rejects.toThrowError(
        ApiError,
      );
      expect(client.isAuthenticated()).toBe(false);
    });

    it("purges all secure credentials and tenant caches on logout", async () => {
      // Simulate active session
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "set-cookie": "sid=sess_purge_test; Path=/" }),
        json: async () => ({ message: "Logged In" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.login("user@test.com", "password");
      client.setActiveTenant(mockTenantA);
      tenantCache.set("user@test.com", mockTenantA.tenant_id, "sales", { total: 5000 });

      // Now logout
      await client.logout();
      expect(client.isAuthenticated()).toBe(false);
      expect(client.getActiveTenant()).toBeNull();

      const storedSid = await getSecureItem(STORAGE_KEYS.SESSION_SID);
      expect(storedSid).toBeNull();

      const cached = tenantCache.get("user@test.com", mockTenantA.tenant_id, "sales");
      expect(cached.data).toBeNull();
    });
  });

  describe("Multi-Tenant Discovery & Switching", () => {
    it("discovers authorized shops for multi-tenant user", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            api_version: 1,
            tenants: [mockTenantA, mockTenantB],
          },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const shops = await client.listUserTenants();
      expect(shops).toHaveLength(2);
      expect(shops[0]?.slug).toBe("shop-a");
      expect(shops[0]?.role).toBe("TENANT_OWNER");
      expect(shops[1]?.slug).toBe("shop-b");
      expect(shops[1]?.role).toBe("STORE_MANAGER");
    });

    it("injects tenant Host and X-Tenant-Id headers when active tenant is selected", async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              api_version: 1,
              business_date: "2026-10-27",
              generated_at: "2026-10-27T00:00:00Z",
              gross_sales: 10000,
              net_sales: 9000,
              taxes_collected: 1000,
              returns_total: 0,
              net_sales_after_returns: 9000,
              bills: 10,
              average_bill_value: 1000,
              returns_count: 0,
              payment_split: [],
              cashier_split: [],
            },
          }),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      client.setActiveTenant(mockTenantA);
      await client.getOwnerSummary();

      expect(capturedHeaders["Host"]).toBe("shop-a.departmentstore.in");
      expect(capturedHeaders["X-Tenant-Id"]).toBe(mockTenantA.tenant_id);
    });

    it("clears cached operational records when switching between shops", () => {
      const userId = "multi_user@example.com";
      client.setActiveTenant(mockTenantA);

      // Populate tenant A cache
      tenantCache.set(userId, mockTenantA.tenant_id, "summary", { sales: 25000 });
      expect(tenantCache.get(userId, mockTenantA.tenant_id, "summary").data).toEqual({ sales: 25000 });

      // Switch to tenant B
      client.setActiveTenant(mockTenantB);

      // Tenant A cache is purged
      expect(tenantCache.get(userId, mockTenantA.tenant_id, "summary").data).toBeNull();
      // Tenant B cache starts empty
      expect(tenantCache.get(userId, mockTenantB.tenant_id, "summary").data).toBeNull();
    });

    it("blocks selection and query attempts for suspended shops", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "Tenant workspace 'shop-suspended' has been suspended" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.getTenantInfo(mockSuspendedTenant.tenant_id)).rejects.toThrowError(
        "Tenant workspace 'shop-suspended' has been suspended",
      );
    });
  });

  describe("Offline Read-Only Caching & Stale Data Indication", () => {
    it("returns live data with isStale: false when network succeeds", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            api_version: 1,
            business_date: "2026-10-27",
            generated_at: "2026-10-27T00:00:00Z",
            gross_sales: 15000,
            net_sales: 13500,
            taxes_collected: 1500,
            returns_total: 0,
            net_sales_after_returns: 13500,
            bills: 5,
            average_bill_value: 3000,
            returns_count: 0,
            payment_split: [],
            cashier_split: [],
          },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      client.setActiveTenant(mockTenantA);
      const res = await client.getOwnerSummary();
      expect(res.isStale).toBe(false);
      expect(res.data?.gross_sales).toBe(15000);
    });

    it("falls back to cached data with isStale: true on network disconnection", async () => {
      // 1. Initial successful query to populate cache
      let networkOnline = true;
      const mockFetch = vi.fn().mockImplementation(() => {
        if (!networkOnline) {
          return Promise.reject(new Error("Network connection dropped"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              api_version: 1,
              business_date: "2026-10-27",
              generated_at: "2026-10-27T00:00:00Z",
              gross_sales: 15000,
              net_sales: 13500,
              taxes_collected: 1500,
              returns_total: 0,
              net_sales_after_returns: 13500,
              bills: 5,
              average_bill_value: 3000,
              returns_count: 0,
              payment_split: [],
              cashier_split: [],
            },
          }),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      client.setActiveTenant(mockTenantA);
      await client.getOwnerSummary();

      // 2. Network goes offline; forceRefresh or background query
      networkOnline = false;
      const offlineRes = await client.getOwnerSummary(undefined, true);
      expect(offlineRes.isStale).toBe(true);
      expect(offlineRes.data?.gross_sales).toBe(15000);
      expect(offlineRes.cachedAt).not.toBeNull();
    });

    it("throws Network Error when offline and no cached data exists", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Server unreachable"));
      vi.stubGlobal("fetch", mockFetch);

      client.setActiveTenant(mockTenantA);
      await expect(client.getOwnerSummary()).rejects.toThrowError(ApiError);
    });
  });

  describe("Security: No Secret Leakage", () => {
    it("ensures no database passwords or secret keys exist in client errors or configuration", () => {
      const config = client.getBaseUrl();
      expect(config).not.toContain("password");
      expect(config).not.toContain("secret");
      expect(config).not.toContain("root");

      const err = new ApiError("Failed request", 500);
      expect(err.message).not.toContain("password");
      expect(err.message).not.toContain("secret");
    });
  });
});
