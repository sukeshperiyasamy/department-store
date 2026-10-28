import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useServices } from "./store";
import type { OriginalInvoice } from "../transport/frappe";
import { formatMoney } from "../domain/money";

interface ReturnLineState {
  item_code: string;
  item_name: string;
  sold_qty: number;
  rate: number;
  returnable_qty: number;
  uom: string;
  qty: number;
}

/**
 * Returns screen: find an original bill, select quantities, submit the return.
 * The return is persisted to the same durable outbox as sales — identical
 * idempotency, retry and review semantics apply. Same-day returns are
 * cashier-allowed; older bills require a manager (server-enforced).
 */
export function ReturnsScreen({ onBack }: { onBack: () => void }) {
  const services = useServices();
  const [invoiceName, setInvoiceName] = useState("");
  const [invoice, setInvoice] = useState<OriginalInvoice["invoice"] | null>(null);
  const [lines, setLines] = useState<ReturnLineState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    committed: boolean;
    creditNoteName: string | null;
    error: string | null;
  } | null>(null);

  const lookup = useCallback(async () => {
    setError(null);
    setInvoice(null);
    setLines([]);
    if (!invoiceName.trim()) return;
    setBusy(true);
    try {
      const found = await services.lookupInvoice(invoiceName.trim());
      setInvoice(found.invoice);
      setLines(found.lines.map((l) => ({
        item_code: l.item_code,
        item_name: l.item_name,
        sold_qty: l.sold_qty,
        rate: l.rate,
        returnable_qty: l.returnable_qty,
        uom: l.uom,
        qty: 0,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [invoiceName, services]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !result) onBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [result, onBack]);

  const returnableValue = lines.reduce(
    (sum, l) => sum + Math.min(l.qty, l.returnable_qty) * l.rate, 0);
  const hasSelection = lines.some((l) => l.qty > 0);

  const submit = async () => {
    if (busy || !invoice || !hasSelection) return;
    setBusy(true);
    setError(null);
    try {
      const res = await services.submitReturn({
        originalInvoice: invoice.name,
        lines: lines
          .filter((l) => l.qty > 0)
          .map((l) => ({ item_code: l.item_code, qty: l.qty })),
        reason: `Counter return of ${invoice.name}`,
      });
      setResult({
        committed: res.committed,
        creditNoteName: res.creditNoteName,
        error: res.error,
      });
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="sync-screen">
        <div className="modal-backdrop">
          <div className="modal receipt-modal" role="dialog" aria-label="Return result">
            {result.committed ? (
              <>
                <h2 className="ok" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={22} aria-hidden="true" />
                  <span>Return committed</span>
                </h2>
                <p>Credit note <strong>{result.creditNoteName}</strong></p>
                <p className="hint">Stock and accounting were updated by the ERP.</p>
              </>
            ) : (
              <>
                <h2 className="warn">Saved — needs review</h2>
                <p>{result.error ?? "The return will be retried automatically."}</p>
              </>
            )}
            <button type="button" className="pay-button" onClick={onBack}>
              Back to Billing (Esc)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-screen">
      <h2>Returns &amp; Refunds</h2>
      <p className="muted">
        Find the original bill and choose quantities to return. Refunds follow the
        original payment methods; same-day returns are cashier-allowed, older bills
        need a manager.
      </p>
      <div className="toolbar" style={{ margin: "12px 0" }}>
        <input
          type="text"
          placeholder="Original invoice number, e.g. ACC-SINV-2026-00096"
          value={invoiceName}
          onChange={(e) => setInvoiceName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          aria-label="Original invoice number"
          style={{ minWidth: 320 }}
        />
        <button type="button" className="btn primary" onClick={() => void lookup()} disabled={busy}>
          Find bill
        </button>
        <button type="button" onClick={onBack}>Back to Billing (Esc)</button>
      </div>

      {error && <div role="alert" className="error-banner">{error}</div>}

      {invoice && (
        <section>
          <h3>
            {invoice.name} · {invoice.customer ?? "—"} · {invoice.posting_date}
          </h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Sold</th>
                <th>Rate</th>
                <th>Returnable</th>
                <th>Return qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.item_code}>
                  <td>{line.item_name}</td>
                  <td>{line.sold_qty} {line.uom}</td>
                  <td>{formatMoney({ minor: Math.round(line.rate * 100), currency: "INR" })}</td>
                  <td>{line.returnable_qty}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={line.returnable_qty}
                      step={1}
                      value={line.qty}
                      onChange={(e) => {
                        const qty = Math.max(0, Math.min(line.returnable_qty,
                            Number(e.target.value) || 0));
                        setLines(lines.map((l, i) => (i === index ? { ...l, qty } : l)));
                      }}
                      aria-label={`Return quantity for ${line.item_name}`}
                      style={{ width: 90 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="payment-summary">
            <span>Return value: <strong>{formatMoney({ minor: Math.round(returnableValue * 100), currency: "INR" })}</strong></span>
          </div>
          <button
            type="button"
            className="pay-button"
            disabled={busy || !hasSelection}
            onClick={() => void submit()}
          >
            {busy ? "Submitting…" : "Submit Return"}
          </button>
        </section>
      )}
    </div>
  );
}
