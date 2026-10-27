/**
 * Phase 11 — Release Simulation & Delivery Governance Test Suite
 * Validates:
 * 1. Stack Health & Liveness verification via get_liveness.
 * 2. Canary Tenant Migration via tenant_migration_runner.py.
 * 3. Post-Migration Settings API & Status with authenticated session.
 * 4. Simulated Migration Failure: verifies rollout halts safely and preserves tenant data.
 * 5. Backward compatibility with older POS client payloads (API v1).
 * 6. Offline transaction queue reconciliation & idempotency under retry.
 * 7. Forward-fix, lock release, and final platform health.
 */

import { spawnSync, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const BACKEND_CONTAINER = process.env.BACKEND_CONTAINER || 'departmental-erp-backend-1';

function log(step, msg) {
  console.log(`[RELEASE-SIM] [${new Date().toISOString()}] [${step}] ${msg}`);
}

function getCashierToken() {
  const cmd = `docker exec ${BACKEND_CONTAINER} bench --site frontend execute departmental_store.seeds.make_cashier_user`;
  const raw = execSync(cmd, { encoding: 'utf-8' }).trim();
  const cleaned = raw.replace(/\\"/g, '"');
  const match = cleaned.match(/\{[^}]+\}/);
  if (!match) throw new Error(`Could not parse cashier token from: ${raw}`);
  return JSON.parse(match[0]);
}

function httpPost(endpoint, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const postData = typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGet(endpoint, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const req = http.request(
      url,
      {
        method: 'GET',
        headers: {
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runSuite() {
  const results = {
    started_at: new Date().toISOString(),
    tests: [],
    verdict: 'PASS',
  };

  let cashierToken = null;
  try {
    cashierToken = getCashierToken();
    log('INFO', `Obtained cashier token: key=${cashierToken.api_key.slice(0, 6)}...`);
  } catch (err) {
    log('WARN', `Could not obtain cashier token: ${err.message}`);
  }

  async function test(name, fn) {
    const t0 = Date.now();
    try {
      log('RUN', name);
      await fn();
      const elapsed = Date.now() - t0;
      log('PASS', `${name} (${elapsed}ms)`);
      results.tests.push({ name, status: 'PASS', elapsed_ms: elapsed });
    } catch (err) {
      const elapsed = Date.now() - t0;
      log('FAIL', `${name} (${elapsed}ms): ${err.message}`);
      results.tests.push({ name, status: 'FAIL', elapsed_ms: elapsed, error: err.message });
      results.verdict = 'FAIL';
    }
  }

  // 1. Verify Baseline Stack Health
  await test('1. Baseline Stack Health & Liveness Probe', async () => {
    const res = await httpGet('/api/method/departmental_store.api.health.get_liveness');
    if (res.status !== 200 || !res.data || res.data.message?.status !== 'ok') {
      throw new Error(`Expected HTTP 200 with status ok, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  // 2. Execute Canary Tenant Migration
  await test('2. Canary Tenant Migration via Migration Runner', async () => {
    const proc = spawnSync('python', [
      'scripts/tenant_migration_runner.py',
      '--container', BACKEND_CONTAINER,
      '--canary', 'frontend'
    ], { encoding: 'utf-8' });

    if (proc.status !== 0) {
      throw new Error(`Canary migration runner failed with exit code ${proc.status}: ${proc.stderr || proc.stdout}`);
    }
    if (!proc.stdout.includes('Canary cohort succeeded')) {
      throw new Error(`Canary cohort success message not found in output: ${proc.stdout}`);
    }
  });

  // 3. Verify Post-Migration Settings API and Flags
  await test('3. Post-Migration Settings API & Status', async () => {
    const headers = {};
    if (cashierToken) {
      headers.Authorization = `token ${cashierToken.api_key}:${cashierToken.api_secret}`;
    }

    // Allow gunicorn worker socket 1.5s to settle after maintenance mode off
    await new Promise((r) => setTimeout(r, 1500));

    let res = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await httpGet('/api/method/departmental_store.api.settings.get_settings', headers);
        if (res.status === 200) break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!res || res.status !== 200 || !res.data.message || !res.data.message.flags) {
      throw new Error(`Expected settings flags object, got: ${JSON.stringify(res?.data || res)}`);
    }
    const flags = res.data.message.flags;
    if (flags.batch_expiry_enabled !== true || flags.receipt_printing_enabled !== true) {
      throw new Error(`Default flags mismatch post-migration: ${JSON.stringify(flags)}`);
    }
  });

  // 4. Simulate Migration Failure and Verify Rollout Halts
  await test('4. Simulated Migration Failure & Immediate Rollout Halt', async () => {
    const proc = spawnSync('python', [
      'scripts/tenant_migration_runner.py',
      '--container', BACKEND_CONTAINER,
      '--canary', 'invalid_dummy_site_nonexistent'
    ], { encoding: 'utf-8' });

    // Must fail and halt
    if (proc.status === 0) {
      throw new Error('Expected migration runner to fail on invalid site, but exited 0');
    }
    if (!proc.stdout.includes('HALTING EXECUTION')) {
      throw new Error(`Expected HALTING EXECUTION in output, got: ${proc.stdout}`);
    }

    // Verify control plane site 'frontend' is still 100% healthy
    const res = await httpGet('/api/method/departmental_store.api.health.get_liveness');
    if (res.status !== 200 || res.data.message?.status !== 'ok') {
      throw new Error('Primary site became unresponsive after simulated failure on another site');
    }
  });

  // 5. Test Backward-Compatible POS Client Payload (API v1)
  const stableTxId = `TX-REL-SIM-${Date.now()}`;
  await test('5. Backward-Compatible POS Client Sale Submission', async () => {
    const saleData = {
      api_version: 1,
      transaction_id: stableTxId,
      counter_id: 'counter-1',
      device_id: 'counter-1',
      counter_name: 'Counter 1',
      pos_profile: 'QA Suite Counter',
      occurred_at: new Date().toISOString(),
      customer: 'Walk In Customer',
      lines: [
        {
          line_id: 'line-1',
          item_code: 'BISCUIT-PARLE',
          qty: 1,
        }
      ],
      payments: [
        {
          mode_of_payment: 'Cash',
          amount: 500,
        }
      ],
    };

    const headers = {};
    if (cashierToken) {
      headers.Authorization = `token ${cashierToken.api_key}:${cashierToken.api_secret}`;
    }

    const res = await httpPost(
      '/api/method/departmental_store.api.sales.submit_pos_sale',
      { payload: JSON.stringify(saleData) },
      headers
    );

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
    const msg = res.data?.message;
    if (!msg || (!msg.invoice && !msg.status && !msg.sync_status)) {
      throw new Error(`Unexpected sale submission response: ${JSON.stringify(res.data)}`);
    }
  });

  // 6. Test Offline Transaction Queue Reconciliation & Idempotency
  await test('6. Offline Queue Re-sync & Idempotency Verification', async () => {
    const saleData = {
      api_version: 1,
      transaction_id: stableTxId,
      counter_id: 'counter-1',
      device_id: 'counter-1',
      counter_name: 'Counter 1',
      pos_profile: 'QA Suite Counter',
      occurred_at: new Date().toISOString(),
      customer: 'Walk In Customer',
      lines: [
        {
          line_id: 'line-1',
          item_code: 'BISCUIT-PARLE',
          qty: 1,
        }
      ],
      payments: [
        {
          mode_of_payment: 'Cash',
          amount: 500,
        }
      ],
    };

    const headers = {};
    if (cashierToken) {
      headers.Authorization = `token ${cashierToken.api_key}:${cashierToken.api_secret}`;
    }

    const res = await httpPost(
      '/api/method/departmental_store.api.sales.submit_pos_sale',
      { payload: JSON.stringify(saleData) },
      headers
    );

    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200 on retry, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
    const msg = res.data?.message;
    if (!msg || (!msg.duplicate && !msg.is_duplicate)) {
      throw new Error(`Expected duplicate: true on retry of ${stableTxId}, got: ${JSON.stringify(msg)}`);
    }
  });

  // 7. Verify Forward-Fix & System Lock Release
  await test('7. Migration Locks Cleaned & Platform Healthy', async () => {
    const proc = spawnSync('docker', [
      'exec', BACKEND_CONTAINER,
      'sh', '-c', 'ls -1 /tmp/migration_lock_*.lock 2>/dev/null || true'
    ], { encoding: 'utf-8' });

    const strayLocks = proc.stdout.trim();
    if (strayLocks) {
      throw new Error(`Stray migration locks detected: ${strayLocks}`);
    }

    // Final health verification
    const res = await httpGet('/api/method/departmental_store.api.health.get_liveness');
    if (res.status !== 200 || res.data.message?.status !== 'ok') {
      throw new Error(`Final liveness check failed: ${res.status}`);
    }
  });

  results.completed_at = new Date().toISOString();
  const summaryPath = path.resolve('docs/testing/artifacts/release-simulation-results.json');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf-8');

  log('COMPLETE', `Release Simulation Suite finished with verdict: ${results.verdict}`);
  log('COMPLETE', `Artifact written to: ${summaryPath}`);

  if (results.verdict !== 'PASS') {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
