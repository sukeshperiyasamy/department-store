import { useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { usePos, useServices } from "./store";
import { formatMoney, fromMajorUnits, serverAmountToMoney } from "../domain/money";
import { displayTotals } from "../domain/cart";

interface PaymentRow {
  mode_of_payment: string;
  amount: string;
  reference_no: string;
}

/**
 * Payment screen: cash / UPI / card with split support. Submitting persists the
 * sale + outbox event atomically in SQLite before any UI success is shown.
 */
export function PaymentScreen({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const services = useServices();
  const [rows, setRows] = useState<PaymentRow[]>([
    { mode_of_payment: "Cash", amount: "", reference_no: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    committed: boolean;
    invoiceName: string | null;
    changeAmount: number;
    error: string | null;
    transactionId: string;
  } | null>(null);
  const [printFailed, setPrintFailed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totals = displayTotals(state.cart);
  const totalMajor = totals.estimatedTotalMinor / 100;
  const tendered = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.parseFloat(r.amount) || 0), 0),
    [rows],
  );
  const changeEstimate = tendered - totalMajor;
  const shortfall = tendered + 0.009 < totalMajor;

  const setRow = (index: number, patch: Partial<PaymentRow>) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (busy || shortfall || state.cart.lines.length === 0) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const res = await services.checkout({
        lines: state.cart.lines.map((l) => ({
          item_code: l.itemCode,
          qty: l.qty,
          rate: l.displayRateMinor / 100,
          uom: l.uom,
        })),
        payments: rows
          .filter((r) => Number.parseFloat(r.amount) > 0)
          .map((r) => ({
            mode_of_payment: r.mode_of_payment,
            amount: Number.parseFloat(r.amount),
            ...(r.reference_no.trim() ? { reference_no: r.reference_no.trim() } : {}),
          })),
        totalsEstimate: totalMajor,
      });
      setResult(res);

      const receipt = {
        storeName: "Department Store",
        counterName: state.counterName ?? "Counter",
        cashier: state.user ?? "cashier",
        ...(res.invoiceName ? { invoiceName: res.invoiceName } : {}),
        transactionId: res.transactionId,
        lines: state.cart.lines.map((l) => ({
          itemName: l.itemName,
          qty: l.qty,
          uom: l.uom,
          rateMinor: l.displayRateMinor,
          amountMinor: Math.round(l.displayRateMinor * l.qty),
        })),
        payments: rows
          .filter((r) => Number.parseFloat(r.amount) > 0)
          .map((r) => ({
            modeOfPayment: r.mode_of_payment,
            amountMinor: Math.round((Number.parseFloat(r.amount) || 0) * 100),
            ...(r.reference_no.trim() ? { referenceNo: r.reference_no.trim() } : {}),
          })),
        subtotalMinor: totals.estimatedTotalMinor,
        taxMinor: 0,
        totalMinor: totals.estimatedTotalMinor,
        changeMinor: Math.round(res.changeAmount * 100),
        currency: "INR",
        occurredAt: new Date().toISOString(),
      };
      dispatch({ type: "SET_RECEIPT", receipt });

      const ok = await services.printReceipt(receipt, false);
      setPrintFailed(!ok);

      dispatch({ type: "SET_CART", cart: services.resetCart() });
      void services.refreshCounts();
    } catch (e) {
      // Persist/save failures must be visible — the cashier must never assume
      // a sale went through when it did not.
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="modal-backdrop">
        <div className="modal receipt-modal" role="dialog" aria-label="Sale result">
          {result.committed ? (
            <>
              <h2 className="ok" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={22} aria-hidden="true" />
                <span>Sale committed</span>
              </h2>
              <p>
                Invoice <strong>{result.invoiceName}</strong>
                {result.changeAmount > 0 && (
                  <> · Change due: <strong>{formatMoney(fromMajorUnits(result.changeAmount))}</strong></>
                )}
              </p>
            </>
          ) : (
            <>
              <h2 className="warn">Saved locally — awaiting sync</h2>
              <p>
                The bill is safe on this counter and will sync automatically.
                {result.error && <> Server said: {result.error}</>}
              </p>
            </>
          )}
          {printFailed && (
            <p role="alert" className="error-banner">
              Receipt printing failed — the sale is safe. Reprint from Sync view.
            </p>
          )}
          <button type="button" className="pay-button" onClick={onClose}>
            New Bill (Esc)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Payment">
        <h2>
          Charge {formatMoney(serverAmountToMoney(totalMajor, "INR"))}
          {state.cart.totalsAreEstimates && <small> (offline estimate)</small>}
        </h2>

        {rows.map((row, i) => (
          <div className="payment-row" key={i}>
            <select
              value={row.mode_of_payment}
              onChange={(e) => setRow(i, { mode_of_payment: e.target.value })}
              aria-label="Payment mode"
            >
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
            </select>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Amount"
              value={row.amount}
              onChange={(e) => setRow(i, { amount: e.target.value })}
              aria-label="Amount"
            />
            {row.mode_of_payment !== "Cash" && (
              <input
                placeholder="Reference / UTR (not proof of settlement)"
                value={row.reference_no}
                onChange={(e) => setRow(i, { reference_no: e.target.value })}
                aria-label="Payment reference"
              />
            )}
            {row.mode_of_payment === "Cash" && (
              <button
                type="button"
                onClick={() => setRow(i, { amount: (Number.parseFloat(row.amount) || 0) + 100 + "" })}
              >
                +100
              </button>
            )}
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label="Remove payment method"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}

        <div className="payment-summary">
          <button type="button" onClick={() => setRows([...rows, { mode_of_payment: "Cash", amount: "", reference_no: "" }])}>
            Split payment
          </button>
          <span>Tendered: {formatMoney(fromMajorUnits(tendered))}</span>
          <span className={changeEstimate >= 0 ? "ok" : "warn"}>
            {changeEstimate >= 0 ? "Change: " : "Shortfall: "}
            {formatMoney(fromMajorUnits(Math.abs(changeEstimate)))}
          </span>
        </div>

        {shortfall && (
          <p role="alert" className="error-banner">
            Tendered amount is less than the bill total.
          </p>
        )}
        {submitError && (
          <p role="alert" className="error-banner">
            Could not save the sale: {submitError}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel (Esc)
          </button>
          <button type="button" className="pay-button" onClick={submit} disabled={busy || shortfall}>
            {busy ? "Saving…" : "Complete Sale"}
          </button>
        </div>
      </div>
    </div>
  );
}
