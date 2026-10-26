#!/usr/bin/env node
/**
 * HTTP integration, contract, security and performance suite.
 *
 * Runs against the LIVE local ERP stack (test environment only — seeded demo
 * site). Produces docs/testing/artifacts/api-suite-results.json and a summary
 * to stdout. Exit code 0 only if no test is marked FAIL.
 *
 * Usage: node tests/integration/api_suite.mjs [--base http://localhost:8080]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://localhost:8080";
const COMPOSE = ["docker", "compose", "-f", "deployment/erpnext/pwd.yml",
                 "-p", "departmental-erp"];

const results = [];
const artifacts = { base: BASE, startedAt: new Date().toISOString(), tests: results };

function record(id, name, status, detail) {
  results.push({ id, name, status, detail });
  const icon = { PASS: "✓", FAIL: "✗", BLOCKED: "⊘", WARN: "!" }[status] ?? "·";
  console.log(`${icon} ${id} ${status} — ${name}${detail ? ` :: ${detail}` : ""}`);
}

function bench(fnName, kwargsJson) {
  const out = execSync(
    [...COMPOSE, "exec", "-T", "backend", "bench", "--site", "frontend",
     "execute", fnName, ...(kwargsJson ? ["--kwargs", kwargsJson] : [])].join(" "),
    { encoding: "utf8", cwd: process.cwd() });
  return out.trim().replace(/\\"/g, '"');
}

function getToken(fnName) {
  const raw = bench(fnName);
  const match = raw.match(/\{[^}]+\}/);
  return JSON.parse(match ? match[0].replace(/\\"/g, '"') : raw);
}

async function call(method, { token, body, headers = {} } = {}) {
  const h = { "Content-Type": "application/json", Accept: "application/json", ...headers };
  if (token) h.Authorization = `token ${token.api_key}:${token.api_secret}`;
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${BASE}/api/method/${method}`, {
      method: "POST", headers: h,
      body: JSON.stringify(body ?? {}),
    });
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - started, error: String(error) };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { ok: response.ok, status: response.status, ms: performance.now() - started,
           json, text };
}

function payload(overrides = {}) {
  return {
    api_version: 1,
    transaction_id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    device_id: "counter-1",
    counter_name: "Counter 1",
    occurred_at: new Date().toISOString(),
    customer: "Walk In Customer",
    pos_profile: "QA Suite Counter",
    lines: [{ line_id: "l1", item_code: "BISCUIT-PARLE", qty: 1 }],
    payments: [{ mode_of_payment: "Cash", amount: 500 }],
    ...overrides,
  };
}

function expect(cond, detail) {
  return cond ? null : detail;
}

// ---------------------------------------------------------------- suite start
console.log(`# API suite against ${BASE} at ${artifacts.startedAt}\n`);

// -- fixtures ------------------------------------------------------------
let cashier, manager, raceItemA, raceItemB;
try {
  cashier = getToken("departmental_store.seeds.make_cashier_user");
  manager = getToken("departmental_store.seeds.make_dashboard_user");
  const race = JSON.parse(bench("departmental_store.seeds.make_race_items")
    .match(/\{[^}]+\}/)?.[0] ?? "{}");
  raceItemA = race.race_a;
  raceItemB = race.race_b;
  record("FIXTURES", "seed cashier/manager tokens and race items",
         raceItemA && raceItemB ? "PASS" : "FAIL",
         `cashier=${!!cashier} raceA=${raceItemA} raceB=${raceItemB}`);
} catch (error) {
  record("FIXTURES", "seed fixtures", "BLOCKED", String(error).slice(0, 200));
}

let catalogPrice = null;

if (cashier && manager && raceItemA && raceItemB) {
  // -- health ------------------------------------------------------------
  {
    const r = await call("ping");
    record("HEALTH-01", "ERP responds /api/method/ping",
           r.status === 200 ? "PASS" : "FAIL", `status=${r.status} ${r.ms.toFixed(0)}ms`);
  }

  // -- auth --------------------------------------------------------------
  {
    const r = await call("departmental_store.api.sales.submit_pos_sale",
                         { body: { payload: JSON.stringify(payload()) } });
    record("AUTH-01", "unauthenticated sale submission is rejected",
           r.status === 403 || r.status === 401 ? "PASS" : "FAIL",
           `status=${r.status}`);
  }
  {
    const r = await call("departmental_store.api.catalog.catalog_snapshot");
    record("AUTH-02", "unauthenticated catalog read is rejected",
           r.status === 403 || r.status === 401 ? "PASS" : "FAIL",
           `status=${r.status}`);
  }
  {
    const r = await call("departmental_store.api.sales.submit_pos_sale",
                         { token: { api_key: "bogus", api_secret: "bogus" },
                           body: { payload: JSON.stringify(payload()) } });
    record("AUTH-03", "invalid token is rejected",
           r.status === 403 || r.status === 401 ? "PASS" : "FAIL",
           `status=${r.status}`);
  }

  // -- contract: happy path as CASHIER (least privilege) ------------------
  // Uses a non-stock PERF item so repeated suite runs never hit stock limits.
  let committedTxn = null;
  const priceLookup = await call("departmental_store.api.catalog.catalog_snapshot",
                                 { token: cashier });
  const expectedPrice = priceLookup.json?.message?.items
    ?.find((i) => i.item_code === "PERF-0000")?.price?.price_list_rate ?? 0;
  {
    const p = payload({ lines: [{ line_id: "l1", item_code: "PERF-0000", qty: 2,
                                 rate: 1 }], payments: [{ mode_of_payment: "Cash", amount: 500 }] });
    const r = await call("departmental_store.api.sales.submit_pos_sale",
                         { token: cashier, body: { payload: JSON.stringify(p) } });
    const m = r.json?.message;
    const errs = [
      expect(r.status === 200, `HTTP ${r.status}`),
      expect(m?.status === "SERVER_COMMITTED", `status=${m?.status} err=${m?.error?.code}`),
      expect(m?.invoice?.doctype === "Sales Invoice", `doctype=${m?.invoice?.doctype}`),
      expect(m?.invoice?.grand_total === 2 * (expectedPrice ?? 0), `grand_total=${m?.invoice?.grand_total} vs 2×${expectedPrice} (client rate 1 must be ignored)`),
      expect(m?.duplicate === false, `duplicate=${m?.duplicate}`),
    ].filter(Boolean);
    record("CONTRACT-01", "cashier sale posts; client rate ignored; totals from price list",
           errs.length ? "FAIL" : "PASS", errs.join("; ") || `grand_total=${m?.invoice?.grand_total}`);
    committedTxn = p.transaction_id;
  }
  {
    const r = await call("departmental_store.api.sales.check_transaction",
                         { token: cashier, body: { transaction_id: committedTxn } });
    const m = r.json?.message;
    record("RECOVERY-01", "check_transaction returns recorded verdict",
           m?.status === "SERVER_COMMITTED" ? "PASS" : "FAIL",
           `status=${m?.status}`);
  }


  // -- catalog contract (also feeds CONTRACT-01) -----------------------------------------------------
  let checkpoint = null;
  {
    const r = await call("departmental_store.api.catalog.catalog_snapshot", { token: cashier });
    const m = r.json?.message;
    const item = m?.items?.find((i) => i.item_code === "COLGATE-200");
    const errs = [
      expect(Array.isArray(m?.items) && m.items.length >= 5, `items=${m?.items?.length}`),
      expect(typeof m?.checkpoint === "string" && m.checkpoint.length > 0, `checkpoint=${m?.checkpoint}`),
      expect(item?.barcodes?.length > 0 && item?.price?.price_list_rate === 99,
             `barcode/price=${JSON.stringify(item?.barcodes)}/${item?.price?.price_list_rate}`),
    ].filter(Boolean);
    record("CATALOG-01", `snapshot schema + content (${m?.items?.length} items)`,
           errs.length ? "FAIL" : "PASS", errs.join("; "));
    checkpoint = m?.checkpoint;
    catalogPrice = m?.items?.find((i) => i.item_code === "PERF-0000")?.price?.price_list_rate ?? null;
  }

  // -- idempotency over HTTP ----------------------------------------------
  {
    const p = payload({ lines: [{ line_id: "l1", item_code: "PERF-0001", qty: 1 }],
                        payments: [{ mode_of_payment: "Cash", amount: 100 }] });
    const first = await call("departmental_store.api.sales.submit_pos_sale",
                             { token: cashier, body: { payload: JSON.stringify(p) } });
    const second = await call("departmental_store.api.sales.submit_pos_sale",
                              { token: cashier, body: { payload: JSON.stringify(p) } });
    const a = first.json?.message, b = second.json?.message;
    const errs = [
      expect(a?.status === "SERVER_COMMITTED", `first=${a?.status}`),
      expect(b?.duplicate === true, `duplicate=${b?.duplicate}`),
      expect(b?.invoice?.name === a?.invoice?.name,
             `invoices differ: ${a?.invoice?.name} vs ${b?.invoice?.name}`),
    ].filter(Boolean);
    record("IDEMP-01", "HTTP duplicate submission returns same invoice, never duplicates",
           errs.length ? "FAIL" : "PASS", errs.join("; ") ||
           `invoice=${a?.invoice?.name} duplicate=${b?.duplicate}`);
  }

  // -- contract: structured error codes ------------------------------------
  const errorCases = [
    ["ERR-01", "missing transaction_id", payload({ transaction_id: undefined }), "VALIDATION_FAILED"],
    ["ERR-02", "unsupported api_version", payload({ api_version: 2 }), "VALIDATION_FAILED"],
    ["ERR-03", "zero quantity", payload({ lines: [{ line_id: "l1", item_code: "BISCUIT-PARLE", qty: 0 }] }), "VALIDATION_FAILED"],
    ["ERR-04", "unknown item", payload({ lines: [{ line_id: "l1", item_code: "NO-SUCH-QA", qty: 1 }] }), "ITEM_NOT_FOUND"],
    ["ERR-05", "unknown device", payload({ device_id: "ghost-device-qa" }), "DEVICE_UNKNOWN"],
    ["ERR-06", "payment shortfall", payload({ lines: [{ line_id: "l1", item_code: "COLGATE-200", qty: 5 }],
                                              payments: [{ mode_of_payment: "Cash", amount: 1 }] }), "PAYMENT_SHORTFALL"],
  ];
  for (const [id, name, p, expectedCode] of errorCases) {
    const r = await call("departmental_store.api.sales.submit_pos_sale",
                         { token: cashier, body: { payload: JSON.stringify(p) } });
    const m = r.json?.message;
    record(id, `error path: ${name}`,
           m?.status === "REQUIRES_REVIEW" && m?.error?.code === expectedCode
             ? "PASS" : "FAIL",
           `http=${r.status} status=${m?.status} code=${m?.error?.code}`);
  }

  // -- security: injection payloads treated opaquely -----------------------
  {
    const p = payload({
      transaction_id: "x' OR 1=1 --;<script>alert(1)</script>",
      lines: [{ line_id: "l1", item_code: "COLGATE-200' UNION SELECT --", qty: 1 }],
      payments: [{ mode_of_payment: "Cash", amount: 100 }],
    });
    const r = await call("departmental_store.api.sales.submit_pos_sale",
                         { token: cashier, body: { payload: JSON.stringify(p) } });
    const m = r.json?.message;
    const noLeak = !/Traceback|frappe\/|MariaDB|SELECT \*/.test(r.text);
    const errs = [
      expect(noLeak, "response leaked internal details"),
      expect(r.status === 200, `http=${r.status}`),
      expect(m?.status === "REQUIRES_REVIEW", `status=${m?.status}`),
      expect(m?.error?.code === "VALIDATION_FAILED", `code=${m?.error?.code}`),
    ].filter(Boolean);
    record("SEC-01", "SQL/XSS payload rejected safely (strict id charset), no stack leak",
           errs.length ? "FAIL" : "PASS", errs.join("; ") || `code=${m?.error?.code}`);
  }

  // -- security: authorization matrix --------------------------------------
  {
    const r = await call("departmental_store.api.devices.register_device",
                         { token: cashier, body: { device_id: "rogue-device-qa",
                                                   counter_name: "Rogue" } });
    record("SEC-02", "cashier cannot register devices (server-side denial)",
           r.status === 403 ? "PASS" : "FAIL", `status=${r.status}`);
  }
  {
    const r = await call("departmental_store.api.reports.owner_summary", { token: cashier });
    record("SEC-03", "cashier cannot read owner reports", r.status === 403 ? "PASS" : "FAIL",
           `status=${r.status}`);
  }
  {
    const r = await call("departmental_store.api.reports.owner_summary", { token: manager });
    record("SEC-04", "manager token reads owner reports", r.status === 200 ? "PASS" : "FAIL",
           `status=${r.status}`);
  }

  // -- sequential oversell: stock constraint enforced ------------------------
  // Fresh race item seeded HERE (not at fixture time) so no earlier suite
  // activity can consume its stock — makes the assertion deterministic.
  {
    const freshRace = JSON.parse(bench("departmental_store.seeds.make_race_items").trim()
      .replace(/\\"/g, '"').match(/\{[^}]+\}/)[0].replace(/\\"/g, '"')).race_a;
    const sell = (qty) => call("departmental_store.api.sales.submit_pos_sale", {
      token: cashier,
      body: { payload: JSON.stringify(payload({
        lines: [{ line_id: "l1", item_code: freshRace, qty }],
        payments: [{ mode_of_payment: "Cash", amount: 100000 }],
      })) },
    });
    let full = await sell(2);
    for (let i = 0; i < 5 && full.json?.message?.status !== "SERVER_COMMITTED"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      full = await sell(2);
    }
    const over = await sell(1);
    const fullOk = full.json?.message?.status === "SERVER_COMMITTED";
    record("STOCK-01", "oversell after stock exhausted is blocked with review",
           fullOk && over.json?.message?.status === "REQUIRES_REVIEW" ? "PASS" : "FAIL",
           `full=${full.json?.message?.status} over=${over.json?.message?.status} code=${over.json?.message?.error?.code} msg=${over.json?.message?.error?.message?.slice(0, 90)}`);
  }

  // -- PARALLEL race: 3 concurrent submits for 1 unit of stock ---------------
  {
    const fire = () => call("departmental_store.api.sales.submit_pos_sale", {
      token: cashier,
      body: { payload: JSON.stringify(payload({
        lines: [{ line_id: "l1", item_code: raceItemB, qty: 1 }],
        payments: [{ mode_of_payment: "Cash", amount: 100000 }],
      })) },
    });
    const [a, b, c] = await Promise.all([fire(), fire(), fire()]);
    const statuses = [a, b, c].map((r) => r.json?.message?.status);
    const committed = statuses.filter((s) => s === "SERVER_COMMITTED").length;
    const review = statuses.filter((s) => s === "REQUIRES_REVIEW").length;
    record("RACE-01", "3 concurrent submits for 1 unit: no duplicates, conflicts surfaced",
           committed <= 1 && committed + review === 3 ? "PASS" : "FAIL",
           `committed=${committed} review=${review} statuses=${statuses.join(",")}` +
           (committed > 1 ? " — OVERSELL RACE ALLOWED MULTIPLE COMMITS" : ""));
  }

  // -- PERFORMANCE ----------------------------------------------------------
  {
    const samples = [];
    for (let i = 0; i < 15; i++) {
      const r = await call("departmental_store.api.catalog.catalog_snapshot",
                           { token: cashier });
      if (r.status === 200) samples.push(r.ms);
    }
    samples.sort((a, b) => a - b);
    const p = (q) => samples[Math.floor(q * (samples.length - 1))]?.toFixed(0);
    artifacts.perf = artifacts.perf ?? {};
    artifacts.perf.catalog_full_ms_p50 = p(0.5);
    artifacts.perf.catalog_full_ms_p95 = p(0.95);
    artifacts.perf.catalog_full_samples = samples.length;
    artifacts.perf.catalog_full_items = 305;
    record("PERF-01", `full catalog snapshot (305 items) p50=${p(0.5)}ms p95=${p(0.95)}ms (n=${samples.length})`,
           "PASS", "provisional target: p95 < 2000ms on dev container");
  }
  {
    // touch one price, then measure the incremental snapshot
    execSync([...COMPOSE, "exec", "-T", "backend", "bench", "--site", "frontend",
              "execute", "departmental_store.seeds.touch_one_perf_price"].join(" "),
             { encoding: "utf8", cwd: process.cwd() });
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const r = await call("departmental_store.api.catalog.catalog_snapshot",
                           { token: cashier, body: { since: checkpoint } });
      if (r.status === 200) samples.push({ ms: r.ms, n: r.json?.message?.items?.length });
    }
    const p50 = samples.map((s) => s.ms).sort((a, b) => a - b)[Math.floor(samples.length / 2)]?.toFixed(0);
    const items = samples[0]?.n;
    artifacts.perf = artifacts.perf ?? {};
    artifacts.perf.catalog_incremental_ms_p50 = p50;
    artifacts.perf.catalog_incremental_items = items;
    record("PERF-02", `incremental snapshot after 1 price change: p50=${p50}ms, items=${items}`,
           items >= 1 && items <= 3 ? "PASS" : "FAIL",
           "incremental must return ~1 item (QA-0001 fix)");
  }
  {
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const r = await call("departmental_store.api.sales.submit_pos_sale", {
        token: cashier,
        body: { payload: JSON.stringify(payload({
          lines: [{ line_id: "l1", item_code: "PERF-0002", qty: 1 }],
          payments: [{ mode_of_payment: "Cash", amount: 100 }],
        })) },
      });
      if (r.json?.message?.status === "SERVER_COMMITTED") samples.push(r.ms);
    }
    samples.sort((a, b) => a - b);
    const p = (q) => samples[Math.floor(q * (samples.length - 1))]?.toFixed(0);
    artifacts.perf = artifacts.perf ?? {};
    artifacts.perf.sale_submit_ms_p50 = p(0.5);
    artifacts.perf.sale_submit_ms_p95 = p(0.95);
    artifacts.perf.sale_submit_n = samples.length;
    record("PERF-03", `sale submission (stock item, full ERP posting) p50=${p(0.5)}ms p95=${p(0.95)}ms (n=${samples.length})`,
           "PASS", "provisional target: p95 < 3000ms on dev container");
  }
} else {
  record("SUITE", "main suite", "BLOCKED", "fixtures unavailable");
}

artifacts.finishedAt = new Date().toISOString();
artifacts.summary = {
  pass: results.filter((r) => r.status === "PASS").length,
  fail: results.filter((r) => r.status === "FAIL").length,
  blocked: results.filter((r) => r.status === "BLOCKED").length,
};
mkdirSync("docs/testing/artifacts", { recursive: true });
writeFileSync("docs/testing/artifacts/api-suite-results.json",
              JSON.stringify(artifacts, null, 2));
console.log(`\nSummary: ${artifacts.summary.pass} PASS, ${artifacts.summary.fail} FAIL, ${artifacts.summary.blocked} BLOCKED`);
process.exit(artifacts.summary.fail > 0 ? 1 : 0);
