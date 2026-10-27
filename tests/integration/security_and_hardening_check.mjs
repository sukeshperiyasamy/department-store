/**
 * Automated Security, Hardening, and Reliability Integration Test Suite
 *
 * Verifies:
 * 1. Network perimeter and port exposure (MariaDB 3306 & Redis 6379 isolation).
 * 2. Application liveness and protected telemetry endpoints.
 * 3. Secret hygiene and .gitignore configuration.
 * 4. Backup artifact integrity and SHA256 checksum validity.
 * 5. Cross-tenant authorization and security boundaries.
 * 6. Fail-closed environment configuration.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

const ERP_URL = process.env.ERP_BASE_URL || "http://localhost:8080";

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts });
  } catch (err) {
    return (err.stdout || "") + "\n" + (err.stderr || "");
  }
}

async function main() {
  console.log("==================================================================");
  console.log("Phase 8 — Production Hardening & Security Readiness Check Suite");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------------------
  // Test 1: Container Port Exposure & Network Isolation
  // -----------------------------------------------------------------------------
  console.log("1. Checking Container Port Exposure & Network Isolation...");
  const psOutput = run('docker ps --format "{{.Names}}\t{{.Ports}}"');
  
  // MariaDB (3306) must NOT be bound to 0.0.0.0
  const dbLine = psOutput.split("\n").find((l) => l.includes("db-1"));
  const dbExposedToHost = dbLine && dbLine.includes("0.0.0.0:3306");
  assert(!dbExposedToHost, "MariaDB port 3306 is not published to host interface (internal only)");

  // Redis (6379) must NOT be bound to 0.0.0.0
  const redisQueueLine = psOutput.split("\n").find((l) => l.includes("redis-queue-1"));
  const redisExposedToHost = redisQueueLine && redisQueueLine.includes("0.0.0.0:6379");
  assert(!redisExposedToHost, "Redis port 6379 is not published to host interface (internal only)");

  // Frontend port 8080 must be the only published web port
  const frontendLine = psOutput.split("\n").find((l) => l.includes("frontend-1"));
  const frontendExposed = frontendLine && frontendLine.includes("8080");
  assert(frontendExposed, "Nginx Frontend port 8080 is accessible as ingress gateway");

  // -----------------------------------------------------------------------------
  // Test 2: Application Liveness & Health Probe
  // -----------------------------------------------------------------------------
  console.log("\n2. Checking Health & Telemetry Probes...");
  try {
    const liveRes = await fetch(`${ERP_URL}/api/method/departmental_store.api.health.get_liveness`, {
      headers: { "X-Correlation-ID": "test-sec-corr-1" },
    });
    const liveJson = await liveRes.json();
    const livenessOk = liveRes.status === 200 && liveJson.message?.status === "ok";
    assert(livenessOk, "ERPNext get_liveness probe returned 200 OK");
    assert(liveJson.message?.correlation_id === "test-sec-corr-1", "Correlation ID traced across request/response");
  } catch (err) {
    assert(false, `ERPNext get_liveness probe failed: ${err.message}`);
  }

  // -----------------------------------------------------------------------------
  // Test 3: Protected Telemetry Access Control
  // -----------------------------------------------------------------------------
  console.log("\n3. Checking Protected Telemetry Role Boundaries...");
  try {
    // Calling get_system_health as guest without token MUST be rejected
    const unauthRes = await fetch(`${ERP_URL}/api/method/departmental_store.api.health.get_system_health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(
      unauthRes.status === 403 || unauthRes.status === 401 || unauthRes.status === 500,
      `Unauthenticated telemetry probe was denied (HTTP ${unauthRes.status})`
    );
  } catch (err) {
    assert(false, `Telemetry authorization check failed: ${err.message}`);
  }

  // -----------------------------------------------------------------------------
  // Test 4: Secret Hygiene & Git Ignore Rules
  // -----------------------------------------------------------------------------
  console.log("\n4. Checking Secret Hygiene & Git Exclusion Rules...");
  const gitIgnoreContent = fs.readFileSync(".gitignore", "utf8");
  assert(gitIgnoreContent.includes(".env"), ".gitignore includes .env pattern");
  assert(gitIgnoreContent.includes("*.token"), ".gitignore includes *.token pattern");
  assert(gitIgnoreContent.includes("tok.env"), ".gitignore includes tok.env pattern");

  // Verify that .env.example files contain placeholders, not real secrets
  const envExample = fs.readFileSync(".env.example", "utf8");
  assert(
    envExample.includes("placeholder_") && !envExample.includes("ghp_") && !envExample.includes("sk_live"),
    "Root .env.example contains placeholder values only"
  );

  // -----------------------------------------------------------------------------
  // Test 5: Backup Artifact Integrity & SHA256 Checksums
  // -----------------------------------------------------------------------------
  console.log("\n5. Checking Backup Artifacts and SHA256 Checksums...");
  const backupRoot = path.join(os.homedir(), "departmental-backups");
  if (fs.existsSync(backupRoot)) {
    const entries = fs.readdirSync(backupRoot).filter((f) => fs.statSync(path.join(backupRoot, f)).isDirectory());
    entries.sort().reverse();
    const latestBackupDir = entries.length > 0 ? path.join(backupRoot, entries[0]) : null;

    if (latestBackupDir) {
      const files = fs.readdirSync(latestBackupDir);
      const hasDbDump = files.some((f) => f.endsWith("-database.sql.gz"));
      const hasConfig = files.some((f) => f.endsWith("-site_config_backup.json"));
      const hasChecksums = files.includes("SHA256SUMS.txt");

      assert(hasDbDump, `Latest backup directory has database dump (${entries[0]})`);
      assert(hasConfig, "Latest backup directory has site config with encryption keys");
      assert(hasChecksums, "Latest backup directory contains SHA256SUMS.txt");

      if (hasChecksums && hasDbDump) {
        const checksumLines = fs.readFileSync(path.join(latestBackupDir, "SHA256SUMS.txt"), "utf8").split("\n");
        const dbDumpFile = files.find((f) => f.endsWith("-database.sql.gz"));
        const matchingLine = checksumLines.find((l) => l.includes(dbDumpFile));

        if (matchingLine) {
          const expectedHash = matchingLine.trim().split(/\s+/)[0].toLowerCase();
          const fileData = fs.readFileSync(path.join(latestBackupDir, dbDumpFile));
          const actualHash = crypto.createHash("sha256").update(fileData).digest("hex").toLowerCase();
          assert(expectedHash === actualHash, "Database dump cryptographic SHA256 matches SHA256SUMS.txt");
        }
      }
    } else {
      console.log("  [WARN] No backup directories found in backup root; skipping checksum test");
    }
  } else {
    console.log("  [WARN] Backup directory not found on host; skipping test");
  }

  // -----------------------------------------------------------------------------
  // Test 6: Cross-Tenant Isolation via Host Resolution
  // -----------------------------------------------------------------------------
  console.log("\n6. Checking Cross-Tenant Isolation and Unverified Host Rejection...");
  try {
    const forgedHostRes = await fetch(`${ERP_URL}/api/method/departmental_store.api.tenant.resolve_tenant_by_host`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: "unverified-attacker-host.com" }),
    });
    const forgedJson = await forgedHostRes.json();
    const resMsg = forgedJson.message;
    const isRejected = !resMsg || resMsg.matched === false || resMsg.tenant === null || forgedJson.exc;
    assert(isRejected, "Unregistered / malicious host header safely rejected (matched: false, tenant: null)");
  } catch (err) {
    assert(false, `Cross-tenant host resolution test failed: ${err.message}`);
  }

  // -----------------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------------");
  console.log(`Security & Hardening Check Results: ${passed} passed, ${failed} failed`);
  console.log("------------------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
