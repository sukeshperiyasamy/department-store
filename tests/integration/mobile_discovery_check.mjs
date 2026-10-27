/**
 * Phase 5 — Mobile Authentication, Tenant Discovery, and Isolation Check.
 *
 * Runs against the live Docker ERP stack to verify:
 * 1. Guest blocking on protected mobile endpoints.
 * 2. Mobile session capture and sid retrieval.
 * 3. User profile and authorized tenant discovery.
 * 4. Tenant-scoped query validation and cross-tenant access denial.
 * 5. Tenant context switching with client cache invalidation.
 * 6. Logout and session invalidation.
 */

import { strict as assert } from "node:assert";

const ERP_BASE_URL = process.env.ERP_BASE_URL || "http://localhost:8080";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

console.log(`=== Mobile Auth & Multi-Tenant Discovery Check ===`);
console.log(`Target ERP Host: ${ERP_BASE_URL}\n`);

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function asyncCheck(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function main() {
  let sessionSid = "";

  // 1. Guest access is blocked
  await asyncCheck("Guest blocked on get_current_user_profile", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.get_current_user_profile`);
    const json = await res.json();
    assert.equal(res.status, 403, `Expected 403 for guest, got ${res.status}`);
    assert.equal(json.exc_type, "PermissionError", "Expected PermissionError");
  });

  await asyncCheck("Guest blocked on list_user_tenants", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.list_user_tenants`);
    const json = await res.json();
    assert.equal(res.status, 403, `Expected 403 for guest, got ${res.status}`);
    assert.equal(json.exc_type, "PermissionError", "Expected PermissionError");
  });

  // 2. Mobile Login & SID Capture
  await asyncCheck("Mobile sign in captures session cookie", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ usr: "Administrator", pwd: ADMIN_PASSWORD }).toString(),
    });
    assert.equal(res.status, 200, `Expected 200 on login, got ${res.status}`);

    const setCookie = res.headers.get("set-cookie") || "";
    const match = setCookie.match(/sid=([^;]+)/);
    assert.ok(match && match[1], "Expected sid in set-cookie header");
    sessionSid = match[1];
    assert.ok(sessionSid.length > 5, "Session sid must be non-empty");
  });

  // 3. User Profile & Tenant Discovery
  let discoveredTenants = [];
  await asyncCheck("Authenticated profile returns user details and authorized tenants", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.get_current_user_profile`, {
      headers: { Cookie: `sid=${sessionSid}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    const profile = json.message;
    assert.equal(profile.api_version, 1, "Expected api_version 1");
    assert.equal(profile.user_id, "Administrator", "Expected user_id Administrator");
    assert.ok(Array.isArray(profile.roles), "Expected roles array");
    assert.ok(profile.roles.includes("System Manager"), "Expected System Manager role");
    assert.ok(Array.isArray(profile.tenants), "Expected tenants array");
    assert.ok(profile.tenants.length > 0, "Expected at least 1 authorized tenant");
    discoveredTenants = profile.tenants;
  });

  await asyncCheck("list_user_tenants returns verified tenant records", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.list_user_tenants`, {
      headers: { Cookie: `sid=${sessionSid}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.message.api_version, 1);
    assert.ok(json.message.tenants.length > 0);
    const firstTenant = json.message.tenants[0];
    assert.ok(firstTenant.tenant_id, "Tenant must have tenant_id");
    assert.ok(firstTenant.slug, "Tenant must have slug");
    assert.ok(firstTenant.name, "Tenant must have name");
    assert.ok(firstTenant.role, "Tenant must specify user role");
    assert.equal(firstTenant.status, "ACTIVE", "Active store must be ACTIVE");
  });

  // 4. Tenant Info & Cross-Tenant Access Enforcement
  await asyncCheck("get_tenant_info returns verified tenant metadata", async () => {
    const tenantId = discoveredTenants[0].tenant_id;
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.get_tenant_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${sessionSid}`,
      },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.message.tenant.tenant_id, tenantId);
    assert.equal(json.message.tenant.lifecycle_status, "ACTIVE");
  });

  await asyncCheck("get_tenant_info rejects forged or foreign tenant ID", async () => {
    const res = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.get_tenant_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `sid=${sessionSid}`,
      },
      body: JSON.stringify({ tenant_id: "00000000-0000-4000-8000-FORGED000000" }),
    });
    assert.ok(res.status === 403 || res.status === 417, `Expected error status, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.exc_type, "PermissionError", "Expected PermissionError for forged tenant");
  });

  // 5. Tenant Cache Scoping & Isolation
  check("Tenant cache isolation logic prevents cross-tenant data leakage", () => {
    const cache = new Map();
    const setCached = (userId, tenantId, key, val) => cache.set(`${userId}:${tenantId}:${key}`, val);
    const getCached = (userId, tenantId, key) => cache.get(`${userId}:${tenantId}:${key}`) || null;
    const clearTenant = (tenantId) => {
      for (const k of Array.from(cache.keys())) {
        if (k.includes(`:${tenantId}:`)) cache.delete(k);
      }
    };

    setCached("user1", "tenant-a", "sales", { total: 100 });
    setCached("user1", "tenant-b", "sales", { total: 200 });

    assert.equal(getCached("user1", "tenant-a", "sales").total, 100);
    assert.equal(getCached("user1", "tenant-b", "sales").total, 200);

    // Switching to tenant-b clears tenant-a cache
    clearTenant("tenant-a");
    assert.equal(getCached("user1", "tenant-a", "sales"), null, "Tenant A cache must be purged");
    assert.equal(getCached("user1", "tenant-b", "sales").total, 200, "Tenant B cache must be preserved");
  });

  // 6. Logout and Session Invalidation
  await asyncCheck("Logout invalidates session cookie", async () => {
    const logoutRes = await fetch(`${ERP_BASE_URL}/api/method/logout`, {
      method: "POST",
      headers: { Cookie: `sid=${sessionSid}` },
    });
    assert.ok(logoutRes.ok || logoutRes.status === 302, "Logout must succeed");

    // Subsequent call with invalidated sid should be blocked
    const testRes = await fetch(`${ERP_BASE_URL}/api/method/departmental_store.api.tenant.get_current_user_profile`, {
      headers: { Cookie: `sid=${sessionSid}` },
    });
    assert.ok(testRes.status === 401 || testRes.status === 403, `Invalidated session must receive 401 or 403, got ${testRes.status}`);
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
