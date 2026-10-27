import { useEffect, useState } from "react";
import { useServices, type ShiftRecord } from "./store";
import { formatMoney, money } from "../domain/money";

export function ShiftModal({ onClose }: { onClose: () => void }) {
  const services = useServices();
  const [shift, setShift] = useState<ShiftRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [floatInput, setFloatInput] = useState("");
  const [countedInput, setCountedInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadCurrentShift = async () => {
    setLoading(true);
    try {
      const s = await services.getCurrentShift();
      setShift(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shift");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCurrentShift();
  }, []);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatAmount = Number.parseFloat(floatInput);
    if (Number.isNaN(floatAmount) || floatAmount < 0) {
      setError("Please enter a valid opening float amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const floatMinor = Math.round(floatAmount * 100);
      await services.openShift(floatMinor);
      setSuccessMsg("Shift opened successfully");
      await loadCurrentShift();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open shift");
    } finally {
      setBusy(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shift) return;
    const countedAmount = Number.parseFloat(countedInput);
    if (Number.isNaN(countedAmount) || countedAmount < 0) {
      setError("Please enter a valid cash count amount");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const countedMinor = Math.round(countedAmount * 100);
      // For expected cash: opening float plus any recorded cash
      const expectedMinor = shift.opening_float_minor;
      await services.closeShift(shift.shift_id, countedMinor, expectedMinor);
      setSuccessMsg("Shift closed successfully");
      await loadCurrentShift();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close shift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal shift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cashier Shift Management</h3>
          <button type="button" className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}
          {successMsg && <div className="success-banner">{successMsg}</div>}

          {loading ? (
            <p className="loading-state">Loading shift details...</p>
          ) : shift ? (
            <div className="active-shift">
              <div className="shift-info-grid">
                <div>
                  <span className="label">Shift ID:</span>
                  <span className="value">{shift.shift_id}</span>
                </div>
                <div>
                  <span className="label">Cashier:</span>
                  <span className="value">{shift.cashier}</span>
                </div>
                <div>
                  <span className="label">Opened At:</span>
                  <span className="value">
                    {new Date(shift.opened_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div>
                  <span className="label">Opening Float:</span>
                  <span className="value">{formatMoney(money(shift.opening_float_minor))}</span>
                </div>
              </div>

              <hr />

              <form onSubmit={handleCloseShift} className="shift-form">
                <h4>Close Cashier Shift</h4>
                <p className="hint">Count physical cash in the drawer before closing the shift.</p>
                <div className="form-group">
                  <label htmlFor="counted-cash">Physical Cash Count (₹):</label>
                  <input
                    id="counted-cash"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 5250.00"
                    value={countedInput}
                    onChange={(e) => setCountedInput(e.target.value)}
                    disabled={busy}
                    autoFocus
                    required
                  />
                </div>

                <div className="modal-actions">
                  <button type="button" onClick={onClose} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="danger-btn" disabled={busy || !countedInput}>
                    {busy ? "Closing..." : "Close Shift"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <form onSubmit={handleOpenShift} className="shift-form">
              <div className="no-shift-notice">
                <p>No active shift is currently open on this counter.</p>
              </div>
              <div className="form-group">
                <label htmlFor="opening-float">Opening Cash Float (₹):</label>
                <input
                  id="opening-float"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 500.00"
                  value={floatInput}
                  onChange={(e) => setFloatInput(e.target.value)}
                  disabled={busy}
                  autoFocus
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={busy || !floatInput}>
                  {busy ? "Opening..." : "Open Shift"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
