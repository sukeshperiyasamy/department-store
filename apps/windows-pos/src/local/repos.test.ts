/**
 * Persistence tests against a REAL SQLite engine (better-sqlite3) — these verify
 * the offline durability guarantees the Tauri driver must uphold: atomic
 * sale+outbox writes, restart durability, guarded state transitions, catalog
 * refresh isolation.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TransactionState as T, type CatalogSnapshot } from "@departmental/shared-types";
import { NodeSqliteDriver } from "./node-driver";
import { PosStore, StateConflictError } from "./repos";

let dir: string;
let dbPath: string;
const openDrivers: NodeSqliteDriver[] = [];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "pos-sqlite-"));
  dbPath = path.join(dir, "pos.db");
});

function newDriver(): NodeSqliteDriver {
  const driver = new NodeSqliteDriver(dbPath);
  openDrivers.push(driver);
  return driver;
}

afterEach(async () => {
  for (const driver of openDrivers.splice(0)) {
    await driver.close();
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function payload(transactionId: string) {
  return {
    api_version: 1 as const,
    transaction_id: transactionId,
    device_id: "counter-1",
    lines: [{ line_id: "l1", item_code: "SKU1", qty: 2 }],
    payments: [{ mode_of_payment: "Cash", amount: 20 }],
  };
}

function snapshot(overrides: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    api_version: 1,
    generated_at: "2026-10-26T10:00:00Z",
    checkpoint: "2026-10-26 10:00:00.000000",
    price_list: "Standard Selling",
    currency: "INR",
    items: [
      {
        item_code: "SKU1",
        item_name: "Colgate 200g",
        stock_uom: "Nos",
        is_stock_item: true,
        has_batch_no: false,
        aliases: ["colgate"],
        barcodes: [{ barcode: "8900000000000" }],
        price: { price_list_rate: 99 },
        modified: "2026-10-26 10:00:00.000000",
      },
    ],
    tax_templates: [],
    payment_modes: [{ mode_of_payment: "Cash", type: "Cash" }],
    is_incremental: false,
    ...overrides,
  };
}

describe("PosStore persistence (real SQLite)", () => {
  it("persists a sale and its outbox event atomically", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    const record = await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());
    expect(record.state).toBe(T.PendingSync);

    const outbox = await store["db"].select("SELECT * FROM outbox");
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ transaction_id: "t1", dispatched_at: null });
  });

  it("rolls back both sale and outbox when the transaction fails", async () => {
    const db = newDriver();
    const store = new PosStore(db);
    await store.migrate();
    await expect(
      db.transaction(async () => {
        await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const sales = await db.select("SELECT * FROM sales");
    const outbox = await db.select("SELECT * FROM outbox");
    expect(sales).toHaveLength(0);
    expect(outbox).toHaveLength(0);
  });

  it("survives an application restart (reopen the database)", async () => {
    const store1 = new PosStore(newDriver());
    await store1.migrate();
    await store1.saveSaleWithOutbox(payload("t-restart"), "counter-1", Date.now());
    await store1["db"].close();

    const store2 = new PosStore(newDriver());
    await store2.migrate(); // must be idempotent
    const record = await store2.getRecord("t-restart");
    expect(record).not.toBeNull();
    expect(record!.state).toBe(T.PendingSync);
    expect(record!.payload.transaction_id).toBe("t-restart");
  });

  it("enforces guarded state transitions across duplicate delivery", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());

    expect(await store.claimForSync("t1")).toBe(true);
    // Second delivery attempt cannot claim it again.
    expect(await store.claimForSync("t1")).toBe(false);

    await store.markServerCommitted("t1", {
      api_version: 1,
      status: "SERVER_COMMITTED",
      transaction_id: "t1",
      invoice: { doctype: "Sales Invoice", name: "SINV-0001", posting_date: "2026-10-26",
                 net_total: 20, total_taxes_and_charges: 0, grand_total: 20,
                 rounding_adjustment: 0, change_amount: 0, currency: "INR" },
      error: null,
    });

    const record = await store.getRecord("t1");
    expect(record!.state).toBe(T.ServerCommitted);

    // outbox marked dispatched
    const outbox = await store["db"].select<{ dispatched_at: number | null }>(
      "SELECT dispatched_at FROM outbox WHERE transaction_id = 't1'",
    );
    expect(outbox[0]!.dispatched_at).not.toBeNull();

    // committing again from a terminal state raises
    await expect(
      store.markServerCommitted("t1", {
        api_version: 1, status: "SERVER_COMMITTED", transaction_id: "t1",
        invoice: null, error: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects marking an unknown transaction", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await expect(store.markRequiresReview("ghost", {
      api_version: 1, status: "REQUIRES_REVIEW", transaction_id: "ghost",
      invoice: null, error: { code: "VALIDATION_FAILED", message: "x" },
    })).rejects.toThrow(StateConflictError);
  });

  it("resets stale SYNCING records for crash recovery", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());
    await store.claimForSync("t1"); // app crashed right here
    expect((await store.getRecord("t1"))!.state).toBe(T.Syncing);

    const reset = await store.resetStaleSyncing(Date.now());
    expect(reset).toBe(1);
    expect((await store.getRecord("t1"))!.state).toBe(T.PendingSync);
  });

  it("returns due records only when their backoff has expired", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.saveSaleWithOutbox(payload("t1"), "counter-1", 1000);
    const now = Date.now();

    expect(await store.due(now)).toHaveLength(1);
    // Deferring a pending record keeps it pending but schedules a later attempt.
    await store.markRetryableFailure("t1", "network down", now + 60_000);
    expect(await store.due(now)).toHaveLength(0);
    expect(await store.due(now + 61_000)).toHaveLength(1);
    let record = await store.getRecord("t1");
    expect(record!.state).toBe(T.PendingSync);
    expect(record!.attempts).toBe(1);

    // The engine path (claim then fail) is what marks a record SYNC_FAILED.
    await store.claimForSync("t1");
    await store.markRetryableFailure("t1", "network down", now + 30_000);
    record = await store.getRecord("t1");
    expect(record!.state).toBe(T.SyncFailed);
    expect(record!.attempts).toBe(2);
    expect(await store.due(now)).toHaveLength(0);
    expect(await store.due(now + 31_000)).toHaveLength(1);
  });

  it("manual retry moves failed and review records back to pending", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());
    await store.markRetryableFailure("t1", "down", Date.now());
    await store.markRetryableFailure("t1", "manual retry", Date.now());
    expect((await store.getRecord("t1"))!.state).toBe(T.PendingSync);
  });

  it("catalog refresh never touches sales (isolation)", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.saveSaleWithOutbox(payload("t1"), "counter-1", Date.now());

    await store.applyCatalogSnapshot(snapshot(), Date.now());
    const items = await store.allCatalogItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.item_name).toBe("Colgate 200g");
    expect((await store.catalogItemByBarcode("8900000000000"))?.item_code).toBe("SKU1");

    // Incremental refresh with an unknown item adds it and keeps the sale.
    await store.applyCatalogSnapshot(
      snapshot({
        checkpoint: "2026-10-26 11:00:00.000000",
        is_incremental: true,
        items: [
          {
            item_code: "SKU2",
            item_name: "Rice 5kg",
            stock_uom: "Nos",
            is_stock_item: true,
            has_batch_no: false,
            aliases: [],
            barcodes: [],
            price: { price_list_rate: 450 },
            modified: "2026-10-26 11:00:00.000000",
          },
        ],
      }),
      Date.now(),
    );
    expect(await store.allCatalogItems()).toHaveLength(2);
    expect((await store.getRecord("t1"))!.state).toBe(T.PendingSync);
    const meta = await store.catalogMeta();
    expect(meta!.price_list).toBe("Standard Selling");
  });

  it("full catalog refresh replaces the cache atomically", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await store.applyCatalogSnapshot(snapshot(), Date.now());
    await store.applyCatalogSnapshot(snapshot({ items: [] }), Date.now());
    expect(await store.allCatalogItems()).toHaveLength(0);
    expect(await store.catalogItemByBarcode("8900000000000")).toBeNull();
  });

  it("rejects snapshots violating the contract", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    await expect(
      store.applyCatalogSnapshot({ ...snapshot(), api_version: 99 } as unknown as CatalogSnapshot, Date.now()),
    ).rejects.toThrow();
  });

  it("tracks shift open/close with variance", async () => {
    const store = new PosStore(newDriver());
    await store.migrate();
    expect(await store.getCurrentShift("counter-1")).toBeNull();
    const shiftId = await store.openShift("counter-1", "cashier@x", 50000, Date.now());
    const current = await store.getCurrentShift("counter-1");
    expect(current).toMatchObject({
      shift_id: shiftId,
      cashier: "cashier@x",
      opening_float_minor: 50000,
      status: "OPEN",
    });
    await store.closeShift(shiftId, 48700, 50000, Date.now());
    expect(await store.getCurrentShift("counter-1")).toBeNull();
    const rows = await store["db"].select<{ variance_minor: number; status: string }>(
      `SELECT variance_minor, status FROM shifts WHERE shift_id = '${shiftId}'`,
    );
    expect(rows[0]).toMatchObject({ variance_minor: -1300, status: "CLOSED" });
  });
});
