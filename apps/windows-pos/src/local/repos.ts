/**
 * Repositories over the counter SQLite database.
 *
 * saveSaleWithOutbox persists the sale row and its outbox event in ONE
 * transaction — the durability guarantee required by docs/offline-sync-policy.md.
 * Catalog writes are separate transactions and never touch sales data.
 */
import {
  CatalogSnapshotSchema,
  OUTBOX_EVENT_TYPE,
  TransactionState,
  type CatalogItem,
  type CatalogSnapshot,
  type SalePayload,
  type SaleResponse,
  type SyncRecord,
} from "@departmental/shared-types";
import type { SqliteDriver } from "./driver";
import { MIGRATIONS } from "./schema";
import { transition, canTransition } from "../domain/outbox";

export class StateConflictError extends Error {
  constructor(readonly transactionId: string) {
    super(`state conflict for ${transactionId}`);
  }
}

export class PosStore {
  constructor(readonly db: SqliteDriver) {}

  async migrate(): Promise<void> {
    const rows = await this.db.select<{ user_version: number }>("PRAGMA user_version");
    const current = rows[0]?.user_version ?? 0;
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      await this.db.transaction(async () => {
        for (const statement of migration.statements) {
          await this.db.exec(statement);
        }
        await this.db.exec(`PRAGMA user_version = ${migration.version}`);
      });
    }
  }

  // ---------- Sales + outbox (atomic) ----------

  async saveSaleWithOutbox(
    payload: SalePayload,
    deviceId: string,
    nowMs: number,
  ): Promise<SyncRecord> {
    return this.db.transaction(async () => {
      const record: SyncRecord = {
        transaction_id: payload.transaction_id,
        state: TransactionState.PendingSync,
        payload,
        attempts: 0,
        created_at: new Date(nowMs).toISOString(),
        updated_at: new Date(nowMs).toISOString(),
        device_id: deviceId,
        receipt_printed: false,
      };
      await this.db.exec(
        `INSERT INTO sales (transaction_id, state, payload, attempts, device_id,
                            receipt_printed, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          record.transaction_id,
          record.state,
          JSON.stringify(payload),
          record.attempts,
          deviceId,
          nowMs,
          nowMs,
        ],
      );
      await this.db.exec(
        `INSERT INTO outbox (event_id, transaction_id, event_type, payload, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `evt-${payload.transaction_id}`,
          payload.transaction_id,
          OUTBOX_EVENT_TYPE,
          JSON.stringify({ transaction_id: payload.transaction_id }),
          nowMs,
        ],
      );
      return record;
    });
  }

  private async getRow(transactionId: string) {
    const rows = await this.db.select<Record<string, unknown>>(
      `SELECT * FROM sales WHERE transaction_id = ?`,
      [transactionId],
    );
    return rows[0];
  }

  async getRecord(transactionId: string): Promise<SyncRecord | null> {
    const row = await this.getRow(transactionId);
    if (!row) return null;
    return rowToRecord(row);
  }

  async listByStates(states: string[], limit = 200): Promise<SyncRecord[]> {
    const placeholders = states.map(() => "?").join(",");
    const rows = await this.db.select<Record<string, unknown>>(
      `SELECT * FROM sales WHERE state IN (${placeholders})
       ORDER BY created_at ASC LIMIT ?`,
      [...states, limit],
    );
    return rows.map(rowToRecord);
  }

  async pendingCounts(): Promise<Record<string, number>> {
    const rows = await this.db.select<{ state: string; n: number }>(
      `SELECT state, COUNT(*) as n FROM sales GROUP BY state`,
    );
    return Object.fromEntries(rows.map((r) => [r.state, r.n]));
  }

  /** Guarded state move; returns false when the row is not in `fromState`. */
  private async moveTo(
    transactionId: string,
    fromState: string,
    toState: string,
    fields: Record<string, unknown>,
    nowMs: number,
  ): Promise<boolean> {
    const keys = Object.keys(fields);
    const assignments = keys.map((k) => `${k} = ?`).concat("updated_at = ?", "state = ?");
    const values = keys.map((k) => fields[k]).concat(nowMs, toState);
    const result = await this.db.exec(
      `UPDATE sales SET ${assignments.join(", ")}
       WHERE transaction_id = ? AND state = ?`,
      [...values, transactionId, fromState],
    );
    return result.changes > 0;
  }

  async claimForSync(transactionId: string): Promise<boolean> {
    const row = await this.getRow(transactionId);
    if (!row) return false;
    const from = String(row.state);
    // Not claimable (already syncing or terminal): the guarded update below is a no-op.
    if (!canTransition(from as TransactionState, "CLAIM_FOR_SYNC")) return false;
    transition(from as TransactionState, "CLAIM_FOR_SYNC");
    return this.moveTo(transactionId, from, TransactionState.Syncing, {}, Date.now());
  }

  async markServerCommitted(transactionId: string, response: SaleResponse): Promise<void> {
    const row = await this.getRow(transactionId);
    if (!row) throw new StateConflictError(transactionId);
    transition(String(row.state) as TransactionState, "SERVER_COMMITTED");
    await this.moveTo(
      transactionId,
      String(row.state),
      TransactionState.ServerCommitted,
      {
        response: JSON.stringify(response),
        last_error_code: null,
        last_error_message: null,
        next_attempt_at: null,
      },
      Date.now(),
    );
    await this.db.exec(`UPDATE outbox SET dispatched_at = ? WHERE transaction_id = ?`, [
      Date.now(),
      transactionId,
    ]);
  }

  async markRequiresReview(transactionId: string, response: SaleResponse): Promise<void> {
    const row = await this.getRow(transactionId);
    if (!row) throw new StateConflictError(transactionId);
    transition(String(row.state) as TransactionState, "REVIEW_REQUIRED");
    await this.moveTo(
      transactionId,
      String(row.state),
      TransactionState.RequiresReview,
      {
        response: JSON.stringify(response),
        last_error_code: response.error?.code ?? null,
        last_error_message: response.error?.message ?? null,
        next_attempt_at: null,
        attempts: Number(row.attempts) + 1,
      },
      Date.now(),
    );
  }

  async markRetryableFailure(
    transactionId: string,
    error: string,
    nextAttemptAtMs: number,
  ): Promise<void> {
    const row = await this.getRow(transactionId);
    if (!row) throw new StateConflictError(transactionId);
    const state = String(row.state);
    // SYNCING -> SYNC_FAILED on auto failure; SYNC_FAILED/REVIEW -> pending on manual retry.
    const event =
      state === TransactionState.Syncing ? "SYNC_FAILED_RETRYABLE" : "RETRY_NOW";
    const toState = state === TransactionState.Syncing
      ? TransactionState.SyncFailed
      : TransactionState.PendingSync;
    transition(state as TransactionState, event);
    await this.moveTo(
      transactionId,
      state,
      toState,
      {
        last_error_code: null,
        last_error_message: error,
        next_attempt_at: nextAttemptAtMs,
        attempts: Number(row.attempts) + 1,
        response: null,
      },
      Date.now(),
    );
  }

  /** Crash recovery: records left in SYNCING (app killed mid-flight) return to
   * PENDING_SYNC. Safe: server idempotency protects against double commits. */
  async resetStaleSyncing(nowMs: number): Promise<number> {
    const result = await this.db.exec(
      `UPDATE sales SET state = ?, updated_at = ? WHERE state = ?`,
      [TransactionState.PendingSync, nowMs, TransactionState.Syncing],
    );
    return result.changes;
  }

  async due(nowMs: number, limit = 50): Promise<SyncRecord[]> {
    const rows = await this.db.select<Record<string, unknown>>(
      `SELECT * FROM sales
       WHERE state IN (?, ?)
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      [TransactionState.PendingSync, TransactionState.SyncFailed, nowMs, limit],
    );
    return rows.map(rowToRecord);
  }

  async setReceiptPrinted(transactionId: string, printed: boolean): Promise<void> {
    await this.db.exec(`UPDATE sales SET receipt_printed = ?, updated_at = ? WHERE transaction_id = ?`, [
      printed ? 1 : 0,
      Date.now(),
      transactionId,
    ]);
  }

  // ---------- Catalog cache ----------

  async applyCatalogSnapshot(snapshot: CatalogSnapshot, nowMs: number): Promise<void> {
    CatalogSnapshotSchema.parse(snapshot); // validate at the boundary
    await this.db.transaction(async () => {
      if (snapshot.is_incremental) {
        for (const item of snapshot.items) {
          await this.upsertCatalogItem(item, snapshot);
        }
      } else {
        await this.db.exec(`DELETE FROM catalog_barcodes`);
        await this.db.exec(`DELETE FROM catalog_items`);
        for (const item of snapshot.items) {
          await this.upsertCatalogItem(item, snapshot);
        }
      }
      await this.db.exec(
        `INSERT INTO catalog_meta (id, checkpoint, price_list, currency, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET checkpoint = excluded.checkpoint,
           price_list = excluded.price_list, currency = excluded.currency,
           updated_at = excluded.updated_at`,
        [snapshot.checkpoint, snapshot.price_list, snapshot.currency ?? null, nowMs],
      );
    });
  }

  private async upsertCatalogItem(item: CatalogItem, snapshot: CatalogSnapshot): Promise<void> {
    await this.db.exec(
      `INSERT INTO catalog_items (item_code, item_name, item_group, stock_uom, brand,
                                  description, is_stock_item, has_batch_no, aliases,
                                  price_minor, currency, modified, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_code) DO UPDATE SET
         item_name = excluded.item_name, item_group = excluded.item_group,
         stock_uom = excluded.stock_uom, brand = excluded.brand,
         description = excluded.description, is_stock_item = excluded.is_stock_item,
         has_batch_no = excluded.has_batch_no, aliases = excluded.aliases,
         price_minor = excluded.price_minor, currency = excluded.currency,
         modified = excluded.modified, payload = excluded.payload`,
      [
        item.item_code,
        item.item_name,
        item.item_group ?? null,
        item.stock_uom,
        item.brand ?? null,
        item.description ?? null,
        item.is_stock_item ? 1 : 0,
        item.has_batch_no ? 1 : 0,
        item.aliases.join(","),
        item.price ? Math.round(item.price.price_list_rate * 100) : null,
        snapshot.currency ?? null,
        item.modified,
        JSON.stringify(item),
      ],
    );
    for (const barcode of item.barcodes) {
      await this.db.exec(
        `INSERT INTO catalog_barcodes (barcode, item_code) VALUES (?, ?)
         ON CONFLICT(barcode) DO UPDATE SET item_code = excluded.item_code`,
        [barcode.barcode, item.item_code],
      );
    }
  }

  async catalogItemByBarcode(barcode: string): Promise<CatalogItem | null> {
    const rows = await this.db.select<{ payload: string }>(
      `SELECT ci.payload FROM catalog_items ci
       JOIN catalog_barcodes cb ON cb.item_code = ci.item_code
       WHERE cb.barcode = ?`,
      [barcode.trim()],
    );
    const row = rows[0];
    return row ? (JSON.parse(row.payload) as CatalogItem) : null;
  }

  async allCatalogItems(): Promise<CatalogItem[]> {
    const rows = await this.db.select<{ payload: string }>(
      `SELECT payload FROM catalog_items ORDER BY item_name`,
    );
    return rows.map((r) => JSON.parse(r.payload) as CatalogItem);
  }

  async catalogMeta(): Promise<{ checkpoint: string; price_list: string } | null> {
    const rows = await this.db.select<{
      checkpoint: string;
      price_list: string;
    }>(`SELECT checkpoint, price_list FROM catalog_meta WHERE id = 1`);
    return rows[0] ?? null;
  }

  // ---------- Shifts ----------

  async openShift(deviceId: string, cashier: string, openingFloatMinor: number, nowMs: number): Promise<string> {
    const shiftId = `shift-${nowMs}`;
    await this.db.exec(
      `INSERT INTO shifts (shift_id, device_id, cashier, opened_at, opening_float_minor, status)
       VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [shiftId, deviceId, cashier, nowMs, openingFloatMinor],
    );
    return shiftId;
  }

  async closeShift(shiftId: string, countedMinor: number, expectedMinor: number, nowMs: number): Promise<void> {
    await this.db.exec(
      `UPDATE shifts SET status = 'CLOSED', closed_at = ?, counted_minor = ?,
                         expected_minor = ?, variance_minor = ?
       WHERE shift_id = ? AND status = 'OPEN'`,
      [nowMs, countedMinor, expectedMinor, countedMinor - expectedMinor, shiftId],
    );
  }
}

function rowToRecord(row: Record<string, unknown>): SyncRecord {
  const response = row.response ? JSON.parse(String(row.response)) : null;
  return {
    transaction_id: String(row.transaction_id),
    state: String(row.state) as SyncRecord["state"],
    payload: JSON.parse(String(row.payload)),
    response,
    attempts: Number(row.attempts),
    next_attempt_at: row.next_attempt_at === null ? undefined : Number(row.next_attempt_at),
    last_error_code: row.last_error_code === null ? undefined : String(row.last_error_code),
    last_error_message:
      row.last_error_message === null ? undefined : String(row.last_error_message),
    created_at: new Date(Number(row.created_at)).toISOString(),
    updated_at: new Date(Number(row.updated_at)).toISOString(),
    device_id: row.device_id === null ? undefined : String(row.device_id),
    receipt_printed: Number(row.receipt_printed) === 1,
  };
}
