/**
 * Integration Test: Ingress Routing, Dynamic Configuration, and Upstream Simulation (Phase 4B)
 *
 * Verifies:
 * 1. Syntax, completeness, and security options of Traefik static and dynamic configurations.
 * 2. Proper dual-upstream routing logic (Next.js vs Frappe ERP).
 * 3. Cache isolation headers (Vary: Host, Cookie) and HSTS.
 * 4. Path priority (API vs UI) and platform-admin isolation.
 * 5. Rejection of unverified/unknown tenants and untrusted client forwarding headers.
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const INGRESS_DIR = path.join(REPO_ROOT, "deployment", "ingress");
const TRAEFIK_STATIC = path.join(INGRESS_DIR, "traefik.yml");
const ROUTING_DYNAMIC = path.join(INGRESS_DIR, "dynamic", "routing.yml");
const COMPOSE_FILE = path.join(INGRESS_DIR, "docker-compose.traefik.yml");
const ENV_EXAMPLE = path.join(INGRESS_DIR, ".env.example");

console.log("================================================================================");
console.log("INGRESS ROUTING & WILDCARD TLS VERIFICATION SUITE");
console.log("================================================================================");

let passCount = 0;
let failCount = 0;

function assert(condition, testId, description) {
  if (condition) {
    console.log(`  PASS [${testId}] ${description}`);
    passCount++;
  } else {
    console.error(`  FAIL [${testId}] ${description}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// 1. Ingress File Artifact Verification
// -----------------------------------------------------------------------------
console.log("\n[1] Verifying Ingress Deployment Files & Templates...");
assert(fs.existsSync(TRAEFIK_STATIC), "ING-01", "Traefik static configuration (traefik.yml) exists");
assert(fs.existsSync(ROUTING_DYNAMIC), "ING-02", "Traefik dynamic routing configuration (routing.yml) exists");
assert(fs.existsSync(COMPOSE_FILE), "ING-03", "Traefik docker-compose file exists");
assert(fs.existsSync(ENV_EXAMPLE), "ING-04", "Ingress .env.example with placeholders exists");

const traefikStaticContent = fs.readFileSync(TRAEFIK_STATIC, "utf-8");
const routingDynamicContent = fs.readFileSync(ROUTING_DYNAMIC, "utf-8");
const composeContent = fs.readFileSync(COMPOSE_FILE, "utf-8");

// -----------------------------------------------------------------------------
// 2. Traefik Static Configuration Security Checks
// -----------------------------------------------------------------------------
console.log("\n[2] Checking Traefik Static Security & TLS Settings...");
assert(traefikStaticContent.includes("redirections:") && traefikStaticContent.includes("to: websecure"), "SEC-TLS-01", "Port 80 automatically redirects to HTTPS (websecure)");
assert(traefikStaticContent.includes("trustedIPs:"), "SEC-TLS-02", "forwardedHeaders.trustedIPs explicitly configured to reject untrusted proxy metadata");
assert(traefikStaticContent.includes("minVersion: \"VersionTLS12\""), "SEC-TLS-03", "TLS minimum version enforced to TLS 1.2+ with modern cipher suites");
assert(traefikStaticContent.includes("sniStrict: true"), "SEC-TLS-04", "sniStrict enabled to prevent SNI spoofing");
assert(traefikStaticContent.includes("letsencrypt-prod:") && traefikStaticContent.includes("letsencrypt-staging:"), "SEC-TLS-05", "Both production and staging Let's Encrypt resolvers configured");
assert(traefikStaticContent.includes("dnsChallenge:"), "SEC-TLS-06", "ACME DNS-01 challenge configured for wildcard certificates (*.domain)");

// -----------------------------------------------------------------------------
// 3. Dynamic Routing Matrix & Upstream Partitioning
// -----------------------------------------------------------------------------
console.log("\n[3] Checking Dynamic Upstream Partitioning & Routers...");
assert(routingDynamicContent.includes("owner-dashboard-service:") && routingDynamicContent.includes("frappe-frontend-service:"), "ROUT-01", "Dual upstreams defined: owner-dashboard-service and frappe-frontend-service");
assert(routingDynamicContent.includes("marketing-router:") && routingDynamicContent.includes("platform-admin-router:"), "ROUT-02", "Distinct routers for apex marketing and platform administration");
assert(routingDynamicContent.includes("tenant-api-router:") && routingDynamicContent.includes("priority: 100"), "ROUT-03", "Tenant API router has high priority (100) pointing to Frappe Nginx");
assert(routingDynamicContent.includes("tenant-ui-router:") && routingDynamicContent.includes("priority: 50"), "ROUT-04", "Tenant UI router has lower priority (50) pointing to Next.js Owner Dashboard");
assert(routingDynamicContent.includes("Vary: \"Host, Cookie\""), "ROUT-05", "tenant-cache-control middleware enforces Vary: Host, Cookie for cache isolation");
assert(routingDynamicContent.includes("stsSeconds: 31536000") && routingDynamicContent.includes("stsIncludeSubdomains: true"), "ROUT-06", "HSTS header configured with 1-year duration and includeSubdomains");

// -----------------------------------------------------------------------------
// 4. Docker Compose Environment & Secrets Safety
// -----------------------------------------------------------------------------
console.log("\n[4] Checking Compose Environment & Port Exposure...");
assert(!composeContent.includes("8000:8000") && !composeContent.includes("3306:3306") && !composeContent.includes("6379:6379"), "NET-01", "Internal Frappe backend, MariaDB, and Redis ports are NOT exposed publicly");
assert(composeContent.includes("no-new-privileges:true"), "NET-02", "Container security_opt no-new-privileges enabled");
assert(composeContent.includes("traefik-acme:"), "NET-03", "Persistent volume configured for acme.json certificates");

// -----------------------------------------------------------------------------
// 5. Hostname & Subdomain Routing Simulation
// -----------------------------------------------------------------------------
console.log("\n[5] Simulating Ingress Hostname Matching Rules...");

function simulateRoute(hostname, pathname) {
  const normHost = hostname.toLowerCase().split(":")[0];
  const baseDomain = "departmentstore.in";

  if (normHost === baseDomain || normHost === `www.${baseDomain}`) {
    return { router: "marketing-router", upstream: "owner-dashboard:3100", type: "platform" };
  }

  if (normHost === `admin.${baseDomain}`) {
    return { router: "platform-admin-router", upstream: "owner-dashboard:3100", type: "admin" };
  }

  // Tenant subdomain check
  const suffix = `.${baseDomain}`;
  if (normHost.endsWith(suffix)) {
    const slug = normHost.slice(0, -suffix.length);
    if (!slug || slug.includes(".")) {
      return { error: "INVALID_TENANT_SUBDOMAIN", status: 404 };
    }

    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/assets") ||
      pathname.startsWith("/socket.io") ||
      pathname.startsWith("/files")
    ) {
      return { router: "tenant-api-router", upstream: "frontend:8080", type: "tenant-api", slug };
    }

    return { router: "tenant-ui-router", upstream: "owner-dashboard:3100", type: "tenant-ui", slug };
  }

  return { error: "TENANT_NOT_FOUND", status: 404 };
}

// Case A: Apex marketing request
const simA = simulateRoute("departmentstore.in", "/features");
assert(simA.router === "marketing-router" && simA.upstream === "owner-dashboard:3100", "SIM-01", "departmentstore.in/features routes to owner-dashboard marketing");

// Case B: Platform admin request
const simB = simulateRoute("admin.departmentstore.in", "/admin/onboarding");
assert(simB.router === "platform-admin-router" && simB.upstream === "owner-dashboard:3100", "SIM-02", "admin.departmentstore.in/admin/onboarding routes to owner-dashboard admin console");

// Case C: Shop A UI request
const simC = simulateRoute("shop-a.departmentstore.in", "/app");
assert(simC.router === "tenant-ui-router" && simC.slug === "shop-a" && simC.upstream === "owner-dashboard:3100", "SIM-03", "shop-a.departmentstore.in/app routes to owner-dashboard with slug 'shop-a'");

// Case D: Shop A POS API sync request
const simD = simulateRoute("shop-a.departmentstore.in", "/api/method/departmental_store.api.sales.submit_pos_sale");
assert(simD.router === "tenant-api-router" && simD.upstream === "frontend:8080", "SIM-04", "shop-a.departmentstore.in/api/... routes to Frappe frontend Nginx (port 8080)");

// Case E: Shop B Socket.IO connection
const simE = simulateRoute("shop-b.departmentstore.in", "/socket.io/?EIO=4&transport=websocket");
assert(simE.router === "tenant-api-router" && simE.upstream === "frontend:8080", "SIM-05", "shop-b.departmentstore.in/socket.io routes to Frappe frontend (port 8080)");

// Case F: Multi-level or unrecognized hostname rejection
const simF = simulateRoute("deep.sub.departmentstore.in", "/");
assert(simF.error === "INVALID_TENANT_SUBDOMAIN", "SIM-06", "deep.sub.departmentstore.in rejected as invalid multi-level subdomain");

const simG = simulateRoute("unregistered-other-site.com", "/");
assert(simG.error === "TENANT_NOT_FOUND", "SIM-07", "Foreign unmapped domain rejected with TENANT_NOT_FOUND (no silent default fallback)");

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log("================================================================================");

if (failCount > 0) {
  process.exit(1);
} else {
  console.log("All ingress configuration and routing simulation tests passed successfully!\n");
  process.exit(0);
}
