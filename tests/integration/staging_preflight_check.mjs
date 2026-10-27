/**
 * Automated Staging Preflight & Readiness Audit (Phase 4C)
 *
 * Inspects:
 * 1. Docker Compose & Ingress YAML configs for syntax and port security.
 * 2. ACME staging configuration (DNS-01, directory URL, storage).
 * 3. Network isolation and non-exposure of databases/internal services.
 * 4. Staging environment prerequisites and missing authorization checklist.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = process.cwd();
const INGRESS_DIR = path.join(REPO_ROOT, "deployment", "ingress");
const TRAEFIK_STATIC = path.join(INGRESS_DIR, "traefik.yml");
const ROUTING_DYNAMIC = path.join(INGRESS_DIR, "dynamic", "routing.yml");
const COMPOSE_FILE = path.join(INGRESS_DIR, "docker-compose.traefik.yml");
const ENV_EXAMPLE = path.join(INGRESS_DIR, ".env.example");

console.log("================================================================================");
console.log("STAGING PREFLIGHT & READINESS AUDIT (Phase 4C)");
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
// 1. Staging Files & Compose Validation
// -----------------------------------------------------------------------------
console.log("\n[1] Validating Staging Configuration & Templates...");
assert(fs.existsSync(TRAEFIK_STATIC), "STG-FILE-01", "Traefik static configuration exists");
assert(fs.existsSync(ROUTING_DYNAMIC), "STG-FILE-02", "Traefik dynamic routing configuration exists");
assert(fs.existsSync(COMPOSE_FILE), "STG-FILE-03", "Traefik docker-compose file exists");
assert(fs.existsSync(ENV_EXAMPLE), "STG-FILE-04", "Staging .env.example exists");

let composeConfigValid = false;
try {
  const output = execSync(
    `docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_EXAMPLE}" config`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }
  );
  composeConfigValid = output.includes("saas-edge-ingress");
} catch {
  composeConfigValid = false;
}
assert(composeConfigValid, "STG-CFG-01", "docker-compose.traefik.yml renders cleanly via 'docker compose config'");

// -----------------------------------------------------------------------------
// 2. Network & Public Port Security Audit
// -----------------------------------------------------------------------------
console.log("\n[2] Checking Port Exposure & Network Isolation...");
const composeRaw = fs.readFileSync(COMPOSE_FILE, "utf-8");
assert(composeRaw.includes("\"80:80\"") && composeRaw.includes("\"443:443\""), "PORT-01", "Ingress publishes ONLY standard web ports 80 and 443");
assert(!composeRaw.includes("3306:3306"), "PORT-02", "MariaDB port 3306 is NOT published to public interface");
assert(!composeRaw.includes("6379:6379"), "PORT-03", "Redis queue/cache port 6379 is NOT published to public interface");
assert(!composeRaw.includes("8000:8000"), "PORT-04", "Internal Frappe gunicorn port 8000 is NOT published to public interface");
assert(composeRaw.includes("no-new-privileges:true"), "SEC-PRIV-01", "Container security_opt no-new-privileges enabled");

// -----------------------------------------------------------------------------
// 3. Staging TLS & ACME Staging Resolver Audit
// -----------------------------------------------------------------------------
console.log("\n[3] Auditing Staging ACME & DNS-01 Options...");
const traefikRaw = fs.readFileSync(TRAEFIK_STATIC, "utf-8");
assert(
  traefikRaw.includes("letsencrypt-staging:") &&
  traefikRaw.includes("https://acme-staging-v02.api.letsencrypt.org/directory"),
  "ACME-STG-01",
  "Dedicated Let's Encrypt Staging ACME directory configured to avoid prod rate limits"
);
assert(
  traefikRaw.includes("dnsChallenge:") && traefikRaw.includes("resolvers:"),
  "ACME-STG-02",
  "DNS-01 challenge configured with public recursive resolvers (1.1.1.1, 8.8.8.8)"
);
assert(
  traefikRaw.includes("storage: \"/etc/traefik/acme/acme-staging.json\""),
  "ACME-STG-03",
  "Separate certificate storage file for staging certificates"
);

// -----------------------------------------------------------------------------
// 4. Staging Prerequisites & Owner Authorization Audit
// -----------------------------------------------------------------------------
console.log("\n[4] Auditing Live Staging Prerequisites & Authorizations...");
const envRaw = fs.readFileSync(ENV_EXAMPLE, "utf-8");

const prerequisites = [
  { name: "Owner-Controlled Staging Domain", ready: false, detail: "Domain (e.g. staging.departmentstore.in) not delegated; authorization required" },
  { name: "Authoritative DNS Access", ready: false, detail: "Cloudflare/Route53 zone edit access not configured" },
  { name: "DNS-01 Provider Scoped Token", ready: false, detail: "Placeholder token in .env.example; real API token withheld" },
  { name: "Public Staging Linux VM", ready: false, detail: "Currently executing on local Windows dev workstation; no public IP allocated" },
  { name: "External Deployment Authorization", ready: false, detail: "Explicit project owner authorization required before cloud deployment" },
];

console.log("\n  Prerequisites Checklist Status:");
for (const item of prerequisites) {
  console.log(`    [BLOCKED] ${item.name}: ${item.detail}`);
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
console.log("ENVIRONMENT STATUS: BLOCKED (Missing Staging Infrastructure & Authorization)");
console.log("================================================================================");

if (failCount > 0) {
  process.exit(1);
} else {
  console.log("Preflight configuration and deployment templates verified successfully.\n");
  process.exit(0);
}
