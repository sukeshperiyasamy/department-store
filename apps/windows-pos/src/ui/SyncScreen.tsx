import { useEffect } from "react";
import { usePos, useServices } from "./store";
import { formatMoney } from "../domain/money";
import type { SyncRecord } from "@departmental/shared-types";
import { describeRecordState } from "../domain/outbox";
import type { ReceiptData } from "../domain/receipt";

/** Transaction queue view: nothing is ever hidden — pending, failed and review states. */
export function SyncScreen() {
  const { state, dispatch } = usePos();
  const services = useServices();

  useEffect(() => {
    const load = async () => {
      const records = await services.listPending();
      dispatch({ type: "PENDING_RECORDS", records });
    };
    void load();
  }, [dispatch, services, state.counts]);

  const groups: Record<string, SyncRecord[]> = {};
  for (const record of state.pendingRecords) {
    (groups[record.state] ??= []).push(record);
  }

  return (
    <div className="sync-screen">
      <h2>Transactions &amp; Sync</h2>
      {Object.entries(groups).map(([status, records]) => (
        <section key={status}>
          <h3>
            {status.replace("_", " ")} ({records.length})
          </h3>
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Saved</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.transaction_id}>
                  <td>
                    <code>{record.transaction_id.slice(0, 13)}…</code>
                  </td>
                  <td>{new Date(record.created_at).toLocaleTimeString()}</td>
                  <td className={record.state.includes("REVIEW") || record.state.includes("FAILED") ? "warn" : ""}>
                    {describeRecordState(record)}
                  </td>
                  <td>{record.attempts}</td>
                  <td>
                    {(record.state === "SYNC_FAILED" || record.state === "REQUIRES_REVIEW") && (
                      <button
                        type="button"
                        onClick={() => void services.retryTransaction(record.transaction_id)}
                      >
                        Retry now
                      </button>
                    )}
                    {record.state !== "SERVER_COMMITTED" && !record.receipt_printed && (
                      <button type="button" onClick={() => void reprint(record)}>
                        Reprint
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {state.pendingRecords.length === 0 && (
        <p>No transactions queued — everything is synced.</p>
      )}
      <button type="button" onClick={() => dispatch({ type: "SHOW_SCREEN", screen: "billing" })}>
        Back to billing (Esc)
      </button>
    </div>
  );

  async function reprint(record: SyncRecord) {
    const invoice = record.response?.invoice;
    const payload = record.payload;
    const isReturn = record.kind === "return";
    // Reprint values: sale lines carry display rates; return lines are re-priced
    // server-side, so the receipt falls back to the server invoice totals.
    const lines = payload.lines.map((line) => ({
      itemName: line.item_code,
      qty: line.qty,
      uom: ("uom" in line ? line.uom : undefined) ?? "Nos",
      rateMinor: Math.round((("rate" in line ? line.rate : undefined) ?? 0) * 100),
      amountMinor: Math.round((("rate" in line ? line.rate : undefined) ?? 0) * line.qty * 100),
    }));
    const totals =
      "totals" in payload ? payload.totals?.grand_total : undefined;
    const base = {
      storeName: "Department Store",
      counterName: state.counterName ?? "Counter",
      cashier: (("cashier" in payload ? payload.cashier : undefined) ?? state.user ?? "cashier"),
      transactionId: record.transaction_id,
      lines,
      payments: (payload.payments ?? []).map((p) => ({
        modeOfPayment: p.mode_of_payment,
        amountMinor: Math.round(p.amount * 100),
        ...(p.reference_no ? { referenceNo: p.reference_no } : {}),
      })),
      subtotalMinor: Math.round((invoice?.net_total ?? totals ?? 0) * 100),
      taxMinor: Math.round((invoice?.total_taxes_and_charges ?? 0) * 100),
      totalMinor: Math.round((invoice?.grand_total ?? totals ?? 0) * 100),
      changeMinor: Math.round((invoice?.change_amount ?? 0) * 100),
      currency: invoice?.currency ?? "INR",
      occurredAt: record.created_at,
      duplicate: true,
      ...(isReturn && "original_invoice" in payload
          ? { footerNote: `RETURN against ${payload.original_invoice}` }
          : {}),
    };
    const data: ReceiptData = invoice?.name
      ? { ...base, invoiceName: invoice.name }
      : base;
    await services.printReceipt(data, true);
  }
}

export function SyncBadge() {
  const { state, dispatch } = usePos();
  const services = useServices();
  const pending = (state.counts["PENDING_SYNC"] ?? 0) + (state.counts["SYNC_FAILED"] ?? 0);
  const review = state.counts["REQUIRES_REVIEW"] ?? 0;

  useEffect(() => {
    const timer = setInterval(() => void services.refreshCounts(), 4000);
    return () => clearInterval(timer);
  }, [services]);

  return (
    <button
      type="button"
      className={`sync-badge ${review > 0 ? "bad" : pending > 0 ? "warn" : "ok"}`}
      onClick={() => dispatch({ type: "SHOW_SCREEN", screen: "sync" })}
      title="View sync status"
    >
      {review > 0 ? `⚠ ${review} need review` : pending > 0 ? `⇅ ${pending} pending` : "✓ synced"}
      {state.syncError && <span className="error-dot" aria-label="sync error" />}
    </button>
  );
}

export function formatCurrency(minor: number): string {
  return formatMoney({ minor, currency: "INR" });
}
