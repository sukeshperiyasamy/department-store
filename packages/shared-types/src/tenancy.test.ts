import { describe, expect, it } from "vitest";
import {
  authorizeTenantAccess,
  isReservedHostname,
  normalizeHostname,
  resolveTenantByHostname,
  TenantMembership,
  TenantRecord,
  TenantRecordSchema,
  TenantSlugSchema,
  validateHostname,
} from "./tenancy";

const sampleTenantA: TenantRecord = {
  tenant_id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
  slug: "ramesh-stores",
  name: "Ramesh Departmental Store",
  legal_name: "Ramesh Retail Enterprises Private Limited",
  lifecycle_status: "ACTIVE",
  primary_hostname: "ramesh.departmentstore.in",
  hostname_status: "VERIFIED",
  custom_domains: ["rameshstores.com"],
  frappe_site_name: "tenant_ramesh.local",
  plan_id: "growth",
  state_code: "33",
  currency: "INR",
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  created_by: "system_admin",
};

const sampleTenantB: TenantRecord = {
  tenant_id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
  slug: "lakshmi-traders",
  name: "Lakshmi Traders",
  legal_name: "Lakshmi Traders LLP",
  lifecycle_status: "ACTIVE",
  primary_hostname: "lakshmi.departmentstore.in",
  hostname_status: "VERIFIED",
  custom_domains: [],
  frappe_site_name: "tenant_lakshmi.local",
  plan_id: "starter",
  state_code: "33",
  currency: "INR",
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  created_by: "system_admin",
};

const unverifiedTenant: TenantRecord = {
  ...sampleTenantA,
  tenant_id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3",
  slug: "new-mart",
  name: "New Mart",
  primary_hostname: "newmart.com",
  hostname_status: "PENDING",
};

const suspendedTenant: TenantRecord = {
  ...sampleTenantA,
  tenant_id: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4",
  slug: "suspended-mart",
  name: "Suspended Mart",
  lifecycle_status: "SUSPENDED",
  primary_hostname: "suspended.departmentstore.in",
};

const provisioningTenant: TenantRecord = {
  ...sampleTenantA,
  tenant_id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5",
  slug: "provisioning-mart",
  name: "Provisioning Mart",
  lifecycle_status: "PROVISIONING",
  primary_hostname: "provisioning.departmentstore.in",
};

const testRegistry: TenantRecord[] = [
  sampleTenantA,
  sampleTenantB,
  unverifiedTenant,
  suspendedTenant,
  provisioningTenant,
];

describe("TenantSlugSchema", () => {
  it("accepts valid URL-safe slugs", () => {
    expect(TenantSlugSchema.parse("ramesh-stores")).toBe("ramesh-stores");
    expect(TenantSlugSchema.parse("shop123")).toBe("shop123");
    expect(TenantSlugSchema.parse("a-b-c-d")).toBe("a-b-c-d");
  });

  it("rejects invalid slugs", () => {
    expect(() => TenantSlugSchema.parse("ab")).toThrow(); // too short (< 3)
    expect(() => TenantSlugSchema.parse("-bad-start")).toThrow(); // leading hyphen
    expect(() => TenantSlugSchema.parse("bad-end-")).toThrow(); // trailing hyphen
    expect(() => TenantSlugSchema.parse("bad--double")).toThrow(); // consecutive hyphens
    expect(() => TenantSlugSchema.parse("Uppercase")).toThrow(); // uppercase
    expect(() => TenantSlugSchema.parse("special$char")).toThrow(); // special character
  });
});

describe("TenantRecordSchema", () => {
  it("validates a complete tenant record strictly", () => {
    const parsed = TenantRecordSchema.parse(sampleTenantA);
    expect(parsed.tenant_id).toBe("a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1");
    expect(parsed.state_code).toBe("33");
    expect(parsed.currency).toBe("INR");
  });

  it("rejects unknown extra properties (strict)", () => {
    expect(() =>
      TenantRecordSchema.parse({
        ...sampleTenantA,
        malicious_override: true,
      }),
    ).toThrow();
  });

  it("rejects invalid UUIDs", () => {
    expect(() =>
      TenantRecordSchema.parse({
        ...sampleTenantA,
        tenant_id: "not-a-uuid",
      }),
    ).toThrow();
  });
});

describe("Hostname normalization and validation", () => {
  it("normalizes uppercase, ports, protocols, and trailing dots", () => {
    expect(normalizeHostname("RAMESH.EXAMPLE.COM")).toBe("ramesh.example.com");
    expect(normalizeHostname("ramesh.example.com:8080")).toBe("ramesh.example.com");
    expect(normalizeHostname("https://ramesh.example.com:3000/some/path?foo=bar")).toBe("ramesh.example.com");
    expect(normalizeHostname("ramesh.example.com.")).toBe("ramesh.example.com");
    expect(normalizeHostname("  shop.dept.in  ")).toBe("shop.dept.in");
  });

  it("validates compliant RFC 1123 hostnames", () => {
    expect(validateHostname("ramesh.departmentstore.in").valid).toBe(true);
    expect(validateHostname("shop-12.domain.co.in").valid).toBe(true);
  });

  it("rejects invalid hostnames and raw IP addresses", () => {
    expect(validateHostname("").valid).toBe(false);
    expect(validateHostname("192.168.1.1").valid).toBe(false);
    expect(validateHostname("127.0.0.1").valid).toBe(false);
    expect(validateHostname("bad..domain.com").valid).toBe(false);
    expect(validateHostname("bad_subdomain.com").valid).toBe(false);
    expect(validateHostname("-badstart.com").valid).toBe(false);
  });

  it("identifies reserved platform hostnames", () => {
    expect(isReservedHostname("admin")).toBe(true);
    expect(isReservedHostname("localhost")).toBe(true);
    expect(isReservedHostname("api.departmentstore.in", "departmentstore.in")).toBe(true);
    expect(isReservedHostname("dashboard.departmentstore.in", "departmentstore.in")).toBe(true);
    expect(isReservedHostname("ramesh.departmentstore.in", "departmentstore.in")).toBe(false);
  });
});

describe("resolveTenantByHostname", () => {
  const options = { baseDomain: "departmentstore.in" };

  it("resolves tenant by exact primary hostname", () => {
    const res = resolveTenantByHostname("ramesh.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.tenant.slug).toBe("ramesh-stores");
      expect(res.matchedOn).toBe("primary_hostname");
    }
  });

  it("resolves tenant by verified custom domain", () => {
    const res = resolveTenantByHostname("rameshstores.com", testRegistry, options);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.tenant.slug).toBe("ramesh-stores");
      expect(res.matchedOn).toBe("custom_domain");
    }
  });

  it("resolves tenant by subdomain under baseDomain", () => {
    const res = resolveTenantByHostname("lakshmi-traders.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.tenant.slug).toBe("lakshmi-traders");
      expect(res.matchedOn).toBe("subdomain");
    }
  });

  it("rejects unverified hostnames", () => {
    const res = resolveTenantByHostname("newmart.com", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("HOSTNAME_UNVERIFIED");
    }
  });

  it("rejects suspended tenants", () => {
    const res = resolveTenantByHostname("suspended.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("TENANT_SUSPENDED");
    }
  });

  it("rejects provisioning or inactive tenants", () => {
    const res = resolveTenantByHostname("provisioning.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("TENANT_INACTIVE");
    }
  });

  it("rejects unknown hostnames with TENANT_NOT_FOUND (no silent fallback)", () => {
    const res = resolveTenantByHostname("unknown-shop.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("TENANT_NOT_FOUND");
    }
  });

  it("rejects reserved platform domains", () => {
    const res = resolveTenantByHostname("admin.departmentstore.in", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("RESERVED_HOSTNAME");
    }
  });

  it("rejects malformed or injection hostnames", () => {
    const res = resolveTenantByHostname("bad;header/injection", testRegistry, options);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.code).toBe("INVALID_HOSTNAME");
    }
  });
});

describe("authorizeTenantAccess", () => {
  const userA = { user_id: "user-ramesh-1" };
  const userB = { user_id: "user-lakshmi-1" };
  const platformAdmin = { user_id: "super-admin", platform_role: "PLATFORM_ADMIN" as const };

  const memberships: TenantMembership[] = [
    {
      membership_id: "m1111111-1111-4111-8111-111111111111",
      user_id: "user-ramesh-1",
      tenant_id: sampleTenantA.tenant_id,
      role: "TENANT_OWNER",
      status: "ACTIVE",
      created_at: "2026-10-27T00:00:00Z",
      updated_at: "2026-10-27T00:00:00Z",
    },
    {
      membership_id: "m2222222-2222-4222-8222-222222222222",
      user_id: "user-lakshmi-1",
      tenant_id: sampleTenantB.tenant_id,
      role: "CASHIER",
      status: "ACTIVE",
      created_at: "2026-10-27T00:00:00Z",
      updated_at: "2026-10-27T00:00:00Z",
    },
    {
      membership_id: "m3333333-3333-4333-8333-333333333333",
      user_id: "user-suspended-1",
      tenant_id: sampleTenantA.tenant_id,
      role: "STORE_MANAGER",
      status: "SUSPENDED",
      created_at: "2026-10-27T00:00:00Z",
      updated_at: "2026-10-27T00:00:00Z",
    },
  ];

  it("authorizes a user with active membership in the target tenant", () => {
    const auth = authorizeTenantAccess(userA, sampleTenantA.tenant_id, memberships);
    expect(auth.authorized).toBe(true);
    if (auth.authorized) {
      expect(auth.role).toBe("TENANT_OWNER");
      expect(auth.elevated_platform_admin).toBe(false);
    }
  });

  it("strictly blocks cross-tenant access attempts", () => {
    // User A belongs to Tenant A; tries to access Tenant B
    const auth = authorizeTenantAccess(userA, sampleTenantB.tenant_id, memberships);
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.code).toBe("CROSS_TENANT_ACCESS_DENIED");
    }
  });

  it("rejects users without any membership in the target tenant", () => {
    const unknownUser = { user_id: "stranger-1" };
    const auth = authorizeTenantAccess(unknownUser, sampleTenantA.tenant_id, memberships);
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.code).toBe("NO_MEMBERSHIP");
    }
  });

  it("rejects suspended user memberships", () => {
    const suspendedUser = { user_id: "user-suspended-1" };
    const auth = authorizeTenantAccess(suspendedUser, sampleTenantA.tenant_id, memberships);
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.code).toBe("MEMBERSHIP_INACTIVE");
    }
  });

  it("enforces role level requirements", () => {
    // User B is a CASHIER; requires STORE_MANAGER or TENANT_OWNER
    const auth = authorizeTenantAccess(userB, sampleTenantB.tenant_id, memberships, [
      "STORE_MANAGER",
      "TENANT_OWNER",
    ]);
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.code).toBe("INSUFFICIENT_ROLE");
    }
  });

  it("allows platform administrators with audited elevated flag", () => {
    const auth = authorizeTenantAccess(platformAdmin, sampleTenantA.tenant_id, memberships);
    expect(auth.authorized).toBe(true);
    if (auth.authorized) {
      expect(auth.role).toBe("PLATFORM_ADMIN");
      expect(auth.elevated_platform_admin).toBe(true);
    }
  });
});
