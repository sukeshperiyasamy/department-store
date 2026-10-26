#!/usr/bin/env node
/**
 * Reliability check: a sale submitted while the backend is DOWN must survive on
 * the caller side (network error observed), and after the backend restarts the
 * SAME transaction id must commit exactly once (idempotency across restart).
 *
 * Run from the repo root while the test stack is up:
 *   node tests/integration/reliability_check.mjs
 */
import { execSync } from "node:child_process";

const BASE = "http://localhost:8080";
const COMPOSE = ["docker", "compose", "-f", "deployment/erpnext/pwd.yml", "-p", "departmental-erp"];
const results = [];
const record = (id, status, detail) => {
  results.push({ id, status, detail });
  console.log(`${status === "PASS" ? "✓" : "✗"} ${id} ${status} — ${detail}`);
};

// fresh cashier token
const keysOut = execSync([...COMPOSE, "exec", "-T", "backend", "bench", "--site", "frontend",
  "execute", "departmental_store.seeds.make_cashier_user"].join(" "),
  { encoding: "utf8" }).trim().replace(/\\"/g, '"');
const token = JSON.parse(keysOut.match(/\{[^}]+\}/)[0].replace(/\\"/g, '"'));

const txnId = `reliability-${Date.now()}`;
const payload = {
  api_version: 1,
  transaction_id: txnId,
  device_id: "counter-1",
  counter_name: "Counter 1",
  customer: "Walk In Customer",
  pos_profile: "Counter 1",
  lines: [{ line_id: "l1", item_code: "PERF-0003", qty: 1 }],
  payments: [{ mode_of_payment: "Cash", amount: 100 }],
};

const submit = async () => {
  try {
    const response = await fetch(`${BASE}/api/method/departmental_store.api.sales.submit_pos_sale`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
                 Authorization: `token ${token.api_key}:${token.api_secret}` },
      body: JSON.stringify({ payload: JSON.stringify(payload) }),
    });
    const json = await response.json();
    return { status: response.status, message: json?.message };
  } catch (error) {
    return { status: 0, error: String(error).slice(0, 120) };
  }
};

// 1. backend down → network error, transaction NOT lost on the client side
execSync([...COMPOSE, "stop", "backend"].join(" "), { stdio: "ignore" });
const downResult = await submit();
record("RELY-01", downResult.status === 0 ? "PASS" : "FAIL",
       `submit while backend stopped → ${downResult.status === 0
         ? "network error (expected): " + downResult.error
         : "unexpected HTTP response " + downResult.status}`);

// 2. backend restarts → same transaction commits exactly once
execSync([...COMPOSE, "start", "backend"].join(" "), { stdio: "ignore" });
let up = false;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const probe = await fetch(`${BASE}/api/method/ping`);
    if (probe.ok) { up = true; break; }
  } catch { /* still down */ }
}
record("RELY-02", up ? "PASS" : "FAIL", `backend recovered after restart: ${up}`);

const retry = await submit();
const committedOnce = retry.message?.status === "SERVER_COMMITTED" && retry.message?.duplicate === false;
record("RELY-03", committedOnce ? "PASS" : "FAIL",
       `retry after restart → status=${retry.message?.status} duplicate=${retry.message?.duplicate} invoice=${retry.message?.invoice?.name}`);

const again = await submit();
record("RELY-04", again.message?.duplicate === true &&
       again.message?.invoice?.name === retry.message?.invoice?.name ? "PASS" : "FAIL",
       `second retry → duplicate=${again.message?.duplicate} same invoice=${again.message?.invoice?.name === retry.message?.invoice?.name}`);

const fails = results.filter((r) => r.status !== "PASS").length;
process.exit(fails ? 1 : 0);
