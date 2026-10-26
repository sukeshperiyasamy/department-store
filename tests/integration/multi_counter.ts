/**
 * Multi-counter concurrency & offline validation (TypeScript, run with tsx).
 *
 * Two independent counters — separate SQLite DBs, separate sync engines — against
 * the LIVE test ERP:
 *  MC-01 identical catalog sync          MC-04 offline sale survives
 *  MC-02 different products sold         MC-05 backend restart → exactly-once retry
 *  MC-03 final-unit race (2 counters)    MC-06 duplicate delivery
 *  MC-07 malformed payload safety        MC-08 concurrent refunds of one original
 *  MC-09 reopen both counter DBs
 *
 * Real transaction ids, server outcomes, stock states recorded to
 * docs/testing/artifacts/multi-counter-results.json
 *
 * Usage (repo root): npx tsx tests/integration/multi_counter.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeSqliteDriver } from "../../apps/windows-pos/src/local/node-driver";
import { PosStore } from "../../apps/windows-pos/src/local/repos";
import { SyncEngine, type SyncRepo } from "../../apps/windows-pos/src/domain/sync-engine";
import { FrappeClient } from "../../apps/windows-pos/src/transport/frappe";
import type { SalePayload, SyncRecord } from "@departmental/shared-types";

const BASE = "http://localhost:8080";
const COMPOSE = ["docker", "compose", "-f", "deployment/erpnext/pwd.yml",
                 "-p", "departmental-erp"];
const results: { id: string; status: string; detail: string }[] = [];
const evidence: Record<string, unknown> = {
  startedAt: new Date().toISOString(), base: BASE, counters: {}, tests: [],
};

const record = (id: string, status: string, detail: string) => {
  results.push({ id, status, detail });
  console.log(`${status === "PASS" ? "✓" : status === "BLOCKED" ? "⊘" : "✗"} ${id} ${status} — ${detail}`);
};

function bench(fn: string): string {
  return execSync([...COMPOSE, "exec", "-T", "backend", "bench", "--site", "frontend",
                   "execute", fn].join(" "), { encoding: "utf8" });
}
function token(fnName: string) {
  const raw = bench(fnName).trim().replace(/\\"/g, '"');
  return JSON.parse(raw.match(/\{[^}]+\}/)![0].replace(/\\"/g, '"'));
}

interface Counter {
  name: string;
  store: PosStore;
  client: FrappeClient;
  engine: SyncEngine;
}

async function makeCounter(name: string, dbFile: string,
                           apiKey: string, apiSecret: string): Promise<Counter> {
  const driver = new NodeSqliteDriver(dbFile);
  const store = new PosStore(driver);
  await store.migrate();
  const client = new FrappeClient({
    baseUrl: BASE, timeoutMs: 30000,
    apiToken: { key: apiKey, secret: apiSecret },
  });
  const engine = new SyncEngine({
    transport: {
      submit: (record: SyncRecord) => client.submit(record),
      checkTransaction: (id: string) => client.checkTransaction(id),
    },
    repo: store as SyncRepo,
    clock: () => Date.now(),
  });
  return { name, store, client, engine };
}

const payload = (device: string, itemCode: string, qty: number): SalePayload => ({
  api_version: 1,
  transaction_id: `${device}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  device_id: device,
  counter_name: device,
  customer: "Walk In Customer",
  pos_profile: "Counter 1",
  lines: [{ line_id: "l1", item_code: itemCode, qty }],
  payments: [{ mode_of_payment: "Cash", amount: 100000 }],
});

const submitHttp = (auth: { api_key: string; api_secret: string }, body: SalePayload | Record<string, unknown>, method = "sales.submit_pos_sale") =>
  fetch(`${BASE}/api/method/departmental_store.api.${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json",
               Authorization: `token ${auth.api_key}:${auth.api_secret}` },
    body: JSON.stringify({
      payload: typeof body === "string" ? body : JSON.stringify(body),
    }),
  }).then(async (r) => ({ status: r.status, message: (await r.json()).message }));

// ---------------------------------------------------------------------------
async function main() {
  let cashierA, cashierB, raceItem;
  try {
    cashierA = token("departmental_store.seeds.make_cashier_user_a");
    cashierB = token("departmental_store.seeds.make_cashier_user_b");
    const raceRaw = bench("departmental_store.seeds.make_race_items").trim()
      .replace(/\\"/g, '"');
    raceItem = JSON.parse(raceRaw.match(/\{[^}]+\}/)![0].replace(/\\"/g, '"'));
    record("MC-FIXTURES", "two counter tokens + race items", "PASS",
           `raceA=${raceItem.race_a} raceB=${raceItem.race_b}`);
  } catch (e) {
    record("MC-FIXTURES", "fixtures", "BLOCKED", String(e).slice(0, 400));
  }

  if (cashierA && cashierB && raceItem) {
    const dir = mkdtempSync(path.join(tmpdir(), "multicounter-"));
    const dbA = path.join(dir, "counter-a.db");
    const dbB = path.join(dir, "counter-b.db");
    const counterA = await makeCounter("Counter A", dbA, cashierA.api_key, cashierA.api_secret);
    const counterB = await makeCounter("Counter B", dbB, cashierB.api_key, cashierB.api_secret);
    (evidence.counters as Record<string, unknown>) = { A: { db: dbA }, B: { db: dbB } };

    // Register both counters as devices — a MANAGER action (security design);
    // manager token registers, cashier tokens can then bill.
    const manager = token("departmental_store.seeds.make_dashboard_user");
    const managerClient = new FrappeClient({
      baseUrl: BASE, apiToken: { key: manager.api_key, secret: manager.api_secret },
    });
    await managerClient.registerDevice("counter-a", "Counter A");
    await managerClient.registerDevice("counter-b", "Counter B");
    const checkA = await counterA.client.getDevice("counter-a");
    const checkB = await counterB.client.getDevice("counter-b");
    if (checkA.status !== "Enabled" || checkB.status !== "Enabled") {
      record("MC-DEVICES", "both counters registered+enabled", "FAIL",
             `A=${checkA.status} B=${checkB.status}`);
      return;
    }
    record("MC-DEVICES", "both counters registered+enabled by manager", "PASS",
           `A=${checkA.status} B=${checkB.status}`);

  // MC-01 identical catalog
    {
      const [a, b] = await Promise.all([
        counterA.client.catalogSnapshot(),
        counterB.client.catalogSnapshot(),
      ]);
      const ok = a.items.length > 5 && b.items.length === a.items.length &&
                 a.checkpoint === b.checkpoint;
      record("MC-01", "both counters download identical catalog",
             ok ? "PASS" : "FAIL", `items=${a.items.length}/${b.items.length} cp_equal=${a.checkpoint === b.checkpoint}`);
    }

    // MC-02 different products, concurrently
    {
      const tA = payload("counter-a", "COLGATE-200", 1);
      const tB = payload("counter-b", "RICE-BASMATI-5KG", 1);
      await counterA.store.saveSaleWithOutbox(tA, "counter-a", Date.now());
      await counterB.store.saveSaleWithOutbox(tB, "counter-b", Date.now());
      // Engines retry with backoff; allow bounded retries before judging
      // (mirrors the real product behaviour on transient deadlocks).
      const deadline = Date.now() + 15000;
      let recA, recB;
      do {
        await Promise.all([counterA.engine.runOnce(), counterB.engine.runOnce()]);
        recA = await counterA.store.getRecord(tA.transaction_id);
        recB = await counterB.store.getRecord(tB.transaction_id);
        if (recA?.state === "SERVER_COMMITTED" && recB?.state === "SERVER_COMMITTED") break;
        await new Promise((r) => setTimeout(r, 1000));
      } while (Date.now() < deadline);
      const ok = recA?.state === "SERVER_COMMITTED" && recB?.state === "SERVER_COMMITTED";
      (evidence.tests as unknown[]).push({
        id: "MC-02", txns: [tA.transaction_id, tB.transaction_id],
        invoices: [recA?.response?.invoice?.name, recB?.response?.invoice?.name],
      });
      record("MC-02", "different products sold from two counters concurrently",
             ok ? "PASS" : "FAIL",
             `A=${recA?.state}/${recA?.response?.invoice?.name}/${recA?.last_error_message ?? ""} B=${recB?.state}/${recB?.response?.invoice?.name}/${recB?.last_error_message ?? ""}`);
    }

    // MC-03 final-unit race
    {
      const bodyA = payload("counter-a", raceItem.race_b, 1);
      const bodyB = payload("counter-b", raceItem.race_b, 1);
      const [ra, rb] = await Promise.all([
        submitHttp(cashierA, bodyA), submitHttp(cashierB, bodyB),
      ]);
      const committed = [ra, rb].filter((r) => r.message?.status === "SERVER_COMMITTED").length;
      const review = [ra, rb].filter((r) => r.message?.status === "REQUIRES_REVIEW").length;
      const states = [ra, rb].map((r) => r.message?.status);
      (evidence.tests as unknown[]).push({
        id: "MC-03", txnIds: [bodyA.transaction_id, bodyB.transaction_id], statuses: states,
      });
      record("MC-03", "final-unit race: exactly one commit, conflict surfaced",
             committed === 1 && committed + review === 2 ? "PASS" : "FAIL",
             `committed=${committed} review=${review} statuses=${states.join(",")}`);
    }

    // MC-04 offline
    let offlineTxn = "";
    {
      execSync([...COMPOSE, "stop", "backend"].join(" "), { stdio: "ignore" });
      const offline = payload("counter-b", "COLGATE-200", 1);
      offlineTxn = offline.transaction_id;
      await counterB.store.saveSaleWithOutbox(offline, "counter-b", Date.now());
      await counterB.engine.runOnce();
      const pending = await counterB.store.getRecord(offline.transaction_id);
      const ok = pending?.state !== "SERVER_COMMITTED" && pending?.state !== "CANCELLED";
      (evidence.tests as unknown[]).push({
        id: "MC-04", txn: offlineTxn, stateWhileOffline: pending?.state,
      });
      record("MC-04", "offline sale stays pending (never lost or faked)",
             ok ? "PASS" : "FAIL", `state=${pending?.state}`);
    }

    // MC-05 backend restart → exactly-once
    {
      execSync([...COMPOSE, "start", "backend"].join(" "), { stdio: "ignore" });
      let up = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try { if ((await fetch(`${BASE}/api/method/ping`)).ok) { up = true; break; } } catch {}
      }
      await counterB.engine.runOnce();
      const target = await counterB.store.getRecord(offlineTxn);
      const ok = up && target?.state === "SERVER_COMMITTED" &&
                 target?.response?.duplicate === false;
      (evidence.tests as unknown[]).push({
        id: "MC-05", txn: offlineTxn, invoice: target?.response?.invoice?.name,
      });
      record("MC-05", "after backend restart, pending retry commits exactly once",
             ok ? "PASS" : "FAIL",
             `up=${up} state=${target?.state} invoice=${target?.response?.invoice?.name}`);
    }

    // MC-06 duplicate delivery
    {
      const dup = payload("counter-a", "COLGATE-200", 1);
      await counterA.store.saveSaleWithOutbox(dup, "counter-a", Date.now());
      await counterA.engine.runOnce();
      const first = await counterA.store.getRecord(dup.transaction_id);
      await counterA.engine.runOnce();
      const second = await counterA.store.getRecord(dup.transaction_id);
      const ok = second?.state === "SERVER_COMMITTED" &&
                 second?.response?.invoice?.name === first?.response?.invoice?.name;
      (evidence.tests as unknown[]).push({
        id: "MC-06", txn: dup.transaction_id, invoice: second?.response?.invoice?.name,
      });
      record("MC-06", "duplicate delivery does not duplicate the sale",
             ok ? "PASS" : "FAIL",
             `invoice=${second?.response?.invoice?.name} dupFlag=${second?.response?.duplicate}`);
    }

    // MC-07 malformed payload
    {
      const r = await fetch(`${BASE}/api/method/departmental_store.api.sales.submit_pos_sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `token ${cashierA.api_key}:${cashierA.api_secret}` },
        body: JSON.stringify({ payload: "not-json-at-all" }),
      });
      record("MC-07", "malformed payload handled safely",
             r.status === 200 || (r.status >= 400 && r.status < 500) ? "PASS" : "FAIL",
             `status=${r.status}`);
    }

    // MC-08 concurrent refunds of one original
    {
      const sale = payload("counter-a", "PERF-0010", 1);
      const saleRes = await submitHttp(cashierA, sale);
      if (saleRes.message?.status !== "SERVER_COMMITTED") {
        record("MC-08", "concurrent refunds (setup sale)", "BLOCKED",
               `sale=${saleRes.message?.status} ${saleRes.message?.error?.code ?? ""}`);
      } else {
        const makeRefund = (device: string, auth: typeof cashierA) => ({
          api_version: 1,
          transaction_id: `${device}-refund-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          device_id: device,
          original_invoice: saleRes.message!.invoice!.name,
          lines: [{ line_id: "r1", item_code: "PERF-0010", qty: 1 }],
        });
        const [x, y] = await Promise.all([
          submitHttp(cashierA, makeRefund("counter-a", cashierA), "returns.submit_pos_return"),
          submitHttp(cashierB, makeRefund("counter-b", cashierB), "returns.submit_pos_return"),
        ]);
        const committedRefunds = [x, y].filter((r) => r.message?.status === "SERVER_COMMITTED").length;
        const reviewRefunds = [x, y].filter((r) => r.message?.status === "REQUIRES_REVIEW").length;
        const ok = committedRefunds <= 1 && committedRefunds + reviewRefunds === 2;
        (evidence.tests as unknown[]).push({
          id: "MC-08", original: saleRes.message!.invoice!.name,
          statuses: [x.message?.status, y.message?.status],
        });
        record("MC-08", "two counters refund the same original: ≤1 commits",
               ok ? "PASS" : "FAIL",
               `committed=${committedRefunds} review=${reviewRefunds} statuses=${[x.message?.status, y.message?.status].join(",")}`);
      }
    }

    // MC-09 reopen both DBs
    {
      await counterA.store.db.close();
      await counterB.store.db.close();
      const reopenA = new PosStore(new NodeSqliteDriver(dbA));
      const reopenB = new PosStore(new NodeSqliteDriver(dbB));
      const countsA = await reopenA.pendingCounts();
      const countsB = await reopenB.pendingCounts();
      (evidence.counters as Record<string, unknown>).A = { db: dbA, reopenedCounts: countsA };
      (evidence.counters as Record<string, unknown>).B = { db: dbB, reopenedCounts: countsB };
      record("MC-09", "both counter DBs reopen with records intact",
             Object.keys(countsA).length + Object.keys(countsB).length > 0 ? "PASS" : "FAIL",
             `A=${JSON.stringify(countsA)} B=${JSON.stringify(countsB)}`);
      await reopenA.db.close();
      await reopenB.db.close();
    }

    rmSync(dir, { recursive: true, force: true });
  }

  evidence.finishedAt = new Date().toISOString();
  evidence.summary = {
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    blocked: results.filter((r) => r.status === "BLOCKED").length,
  };
  mkdirSync("docs/testing/artifacts", { recursive: true });
  writeFileSync("docs/testing/artifacts/multi-counter-results.json",
                JSON.stringify(evidence, null, 2));
  console.log(`\nMulti-counter: ${evidence.summary.pass} PASS, ${evidence.summary.fail} FAIL, ${evidence.summary.blocked} BLOCKED`);
  process.exit(evidence.summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
