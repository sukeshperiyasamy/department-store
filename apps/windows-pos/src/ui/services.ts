/**
 * Service wiring: composes transport, local store, sync engine and printing
 * into the PosServices the UI consumes. Kept separate from UI per project rules.
 */
import {
  TransactionState,
  type CatalogItem,
  type ReturnPayload,
  type SalePayload,
  type SyncRecord,
} from "@departmental/shared-types";
import { searchCatalog } from "../domain/catalog";
import { clearCart, emptyCart, type Cart } from "../domain/cart";
import { buildEscPosReceipt, type ReceiptData } from "../domain/receipt";
import { SyncEngine, type SyncRepo } from "../domain/sync-engine";
import type { PosStore } from "../local/repos";
import type { FrappeClient } from "../transport/frappe";
import type { Printer } from "../printing/printer";
import type { PosServices, ShiftRecord } from "../ui/store";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class AppServices implements PosServices {
  private readonly engine: SyncEngine;

  constructor(
    readonly client: FrappeClient,
    readonly store: PosStore,
    readonly printer: Printer,
    private readonly opts: {
      deviceId: string;
      counterName: string;
      cashier: string;
      storeName: string;
      serverUrl: string;
    },
  ) {
    this.engine = new SyncEngine({
      transport: {
        submit: (record) => client.submit(record),
        checkTransaction: (id) => client.checkTransaction(id),
      },
      repo: store as SyncRepo,
      clock: () => Date.now(),
    });
  }

  async searchCatalog(query: string): Promise<CatalogItem[]> {
    const items = await this.store.allCatalogItems();
    return searchCatalog(items, query).map((hit) => hit.item);
  }

  async itemByBarcode(barcode: string): Promise<CatalogItem | null> {
    return this.store.catalogItemByBarcode(barcode);
  }

  /** Persists the sale and its outbox event atomically, then syncs immediately. */
  async checkout(input: {
    lines: { item_code: string; qty: number; rate: number; uom: string }[];
    payments: { mode_of_payment: string; amount: number; reference_no?: string }[];
    totalsEstimate: number;
  }): Promise<{
    transactionId: string;
    committed: boolean;
    invoiceName: string | null;
    changeAmount: number;
    error: string | null;
  }> {
    const transactionId = uuid();
    const payload: SalePayload = {
      api_version: 1,
      transaction_id: transactionId,
      device_id: this.opts.deviceId,
      counter_name: this.opts.counterName,
      cashier: this.opts.cashier,
      occurred_at: new Date().toISOString(),
      lines: input.lines.map((line, index) => ({
        line_id: `${transactionId}-l${index}`,
        item_code: line.item_code,
        qty: line.qty,
        rate: line.rate,
        uom: line.uom,
      })),
      payments: input.payments.map((p) => ({
        mode_of_payment: p.mode_of_payment,
        amount: p.amount,
        ...(p.reference_no ? { reference_no: p.reference_no } : {}),
      })),
      totals: { grand_total: input.totalsEstimate },
    };

    await this.store.saveSaleWithOutbox(payload, this.opts.deviceId, Date.now());
    await this.syncNow();

    const record = await this.store.getRecord(transactionId);
    return {
      transactionId,
      committed: record?.state === TransactionState.ServerCommitted,
      invoiceName: record?.response?.invoice?.name ?? null,
      changeAmount: record?.response?.invoice?.change_amount ?? 0,
      error: record?.last_error_message ?? null,
    };
  }

  async syncNow(): Promise<void> {
    await this.engine.runOnce();
  }

  async refreshCounts(): Promise<Record<string, number>> {
    return this.store.pendingCounts();
  }

  async listPending(): Promise<SyncRecord[]> {
    return this.store.listByStates([
      TransactionState.PendingSync,
      TransactionState.Syncing,
      TransactionState.SyncFailed,
      TransactionState.RequiresReview,
      TransactionState.ServerCommitted,
    ]);
  }

  /** Manual retry: pulls failed/review records back to pending then syncs. */
  async retryTransaction(transactionId: string): Promise<void> {
    const record = await this.store.getRecord(transactionId);
    if (!record) return;
    if (record.state === TransactionState.SyncFailed ||
        record.state === TransactionState.RequiresReview ||
        record.state === TransactionState.PendingSync) {
      await this.store.markRetryableFailure(transactionId, "manual retry", Date.now());
      await this.syncNow();
    }
  }

  async lookupInvoice(invoiceName: string) {
    return this.client.getOriginalInvoice(invoiceName);
  }

  /** Persists a return and its outbox event atomically, then syncs immediately. */
  async submitReturn(input: {
    originalInvoice: string;
    lines: { item_code: string; qty: number }[];
    payments?: { mode_of_payment: string; amount: number }[];
    reason?: string;
  }): Promise<{
    transactionId: string;
    committed: boolean;
    creditNoteName: string | null;
    error: string | null;
  }> {
    const transactionId = uuid();
    const payload: ReturnPayload = {
      api_version: 1,
      transaction_id: transactionId,
      device_id: this.opts.deviceId,
      counter_name: this.opts.counterName,
      occurred_at: new Date().toISOString(),
      original_invoice: input.originalInvoice,
      lines: input.lines.map((line, index) => ({
        line_id: `${transactionId}-r${index}`,
        item_code: line.item_code,
        qty: line.qty,
      })),
      ...(input.payments && input.payments.length > 0
        ? { payments: input.payments }
        : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    };
    await this.store.saveReturnWithOutbox(payload, this.opts.deviceId, Date.now());
    await this.syncNow();
    const record = await this.store.getRecord(transactionId);
    return {
      transactionId,
      committed: record?.state === TransactionState.ServerCommitted,
      creditNoteName: record?.response?.invoice?.name ?? null,
      error: record?.last_error_message ?? null,
    };
  }

  /** Print attempt is independent from sync state; returns success. */
  async printReceipt(data: ReceiptData, duplicate: boolean): Promise<boolean> {
    try {
      const bytes = buildEscPosReceipt({ ...data, duplicate });
      await this.printer.printEscPos(bytes);
      await this.store.setReceiptPrinted(data.transactionId, true);
      return true;
    } catch {
      // The sale itself is durable in SQLite; the cashier sees a reprint button.
      return false;
    }
  }

  resetCart(): Cart {
    return emptyCart(false);
  }

  clearedCart(cart: Cart): Cart {
    return clearCart(cart);
  }

  async openShift(openingFloatMinor: number): Promise<string> {
    return this.store.openShift(this.opts.deviceId, this.opts.cashier, openingFloatMinor, Date.now());
  }

  async closeShift(shiftId: string, countedMinor: number, expectedMinor: number): Promise<void> {
    return this.store.closeShift(shiftId, countedMinor, expectedMinor, Date.now());
  }

  async getCurrentShift(): Promise<ShiftRecord | null> {
    return this.store.getCurrentShift(this.opts.deviceId);
  }
}
