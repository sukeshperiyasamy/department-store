#!/usr/bin/env node
/**
 * ISSUE-02 regression guard: apps.txt / module-map stability.
 *
 * Reproduces the churn pattern that historically corrupted sites/apps.txt
 * (repeated bench operations interleaved with app installation and seeding)
 * and asserts module discovery stays stable throughout.
 *
 * Run: node tests/integration/apps_txt_guard.mjs
 * PASS = apps.txt lists every installed app after the hammering AND every
 * bench operation succeeds (no "Module … not found").
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const COMPOSE = ["docker", "compose", "-f", "deployment/erpnext/pwd.yml", "-p", "departmental-erp"];
const results = [];
const record = (id, status, detail) => {
  results.push({ id, status, detail });
  console.log(`${status === "PASS" ? "✓" : "✗"} ${id} ${status} — ${detail}`);
};
const bench = (args) =>
  execSync([...COMPOSE, "exec", "-T", "backend", "bench", "--site", "frontend",
            ...args].join(" "), { encoding: "utf8", cwd: process.cwd() });
const heal = () => bench(["execute", "departmental_store.install.ensure_app_registered"]);

const EXPECTED = ["frappe", "erpnext", "departmental_store", "india_compliance"];

function appsTxt() {
  return bench(["execute",
    "departmental_store.tests.apps_txt_guard.read_apps_txt"]).trim();
}
function moduleMapOk() {
  const out = bench(["execute",
    "departmental_store.tests.apps_txt_guard.check_module_map"]).trim();
  return JSON.parse(out.match(/\{[^}]+\}/)[0]);
}

mkdirSync("docs/testing/artifacts", { recursive: true });

// G-1: self-heal converges apps.txt to DB truth (all installed apps present)
try {
  heal();
  const txt = appsTxt();
  const missing = EXPECTED.filter((a) => !txt.includes(a));
  record("G-01", missing.length === 0 ? "PASS" : "FAIL",
         missing.length ? `apps.txt missing: ${missing}` : "all 4 apps listed");
} catch (e) {
  record("G-01", "FAIL", String(e).slice(0, 200));
}

// G-2: hammer — repeated bench operations of the kinds that historically
//      preceded corruption (migrate-style exec, list-apps, console-equivalent,
//      seeding) — then assert apps.txt unchanged and module map stable.
try {
  const before = appsTxt();
  bench(["list-apps"]);
  bench(["execute", "departmental_store.install.ensure_app_registered"]);
  bench(["execute", "departmental_store.api.settings.get_settings"]);
  bench(["execute", "departmental_store.regional_catalog.seed"]);
  bench(["list-apps"]);
  const after = appsTxt();
  const map = moduleMapOk();
  const ok = after === before && map.departmental_store && map.india_compliance &&
             map.gst_india;
  record("G-02", ok ? "PASS" : "FAIL",
         `apps.txt stable=${after === before}; module map has all=${map.departmental_store && map.india_compliance && map.gst_india}`);
} catch (e) {
  record("G-02", "FAIL", String(e).slice(0, 300));
}

// G-3: regional catalog seeding works repeatedly (idempotent) and module
//      discovery stays alive across the seeding (historically the killer).
try {
  const r1 = bench(["execute",
                    "departmental_store.regional_catalog.seed"]).trim();
  const r2 = bench(["execute",
                    "departmental_store.regional_catalog.seed"]).trim();
  const j1 = JSON.parse(r1.match(/\{[\s\S]+\}/)[0]);
  const j2 = JSON.parse(r2.match(/\{[\s\S]+\}/)[0]);
  const ok = j1.total_demo_items_in_catalog === j2.total_demo_items_in_catalog &&
             j2.total_demo_items_in_catalog >= 100 && j2.skipped_existing > 0;
  record("G-03", ok ? "PASS" : "FAIL",
         `catalog=${j2.total_demo_items_in_catalog} created=${j1.created}/${j2.created} (idempotent)`);
} catch (e) {
  record("G-03", "FAIL", String(e).slice(0, 300));
}

// G-4: sales API still works after all the churn (module discovery intact)
try {
  const tok = JSON.parse(bench(["execute",
    "departmental_store.seeds.make_cashier_user"]).trim().replace(/\\"/g, '"')
    .match(/\{[^}]+\}/)[0].replace(/\\"/g, '"'));
  const r = await fetch("http://localhost:8080/api/method/departmental_store.api.sales.submit_pos_sale", {
    method: "POST",
    headers: { "Content-Type": "application/json",
               Authorization: `token ${tok.api_key}:${tok.api_secret}` },
    body: JSON.stringify({ payload: JSON.stringify({
      api_version: 1,
      transaction_id: `guard-${Date.now()}`,
      device_id: "counter-1",  // demo seed registers this device on every fresh site
      pos_profile: "QA Suite Counter",
      customer: "Walk In Customer",
      lines: [{ line_id: "l1", item_code: "PERF-0005", qty: 1 }],
      payments: [{ mode_of_payment: "Cash", amount: 500 }],
    }) }),
  });
  const m = (await r.json()).message;
  record("G-04", m?.status === "SERVER_COMMITTED" ? "PASS" : "FAIL",
         `status=${m?.status} invoice=${m?.invoice?.name ?? m?.error?.code}`);
} catch (e) {
  record("G-04", "FAIL", String(e).slice(0, 200));
}

const fail = results.filter((r) => r.status === "FAIL").length;
writeFileSync("docs/testing/artifacts/apps-txt-guard-results.json",
              JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
console.log(`\napps.txt guard: ${results.filter((r) => r.status === "PASS").length} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
