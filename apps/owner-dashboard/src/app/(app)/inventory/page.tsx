import { fetchStockAlerts } from "@/lib/frappe-server";
import { ReorderExportButton } from "@/components/ReorderExportButton";

export const dynamic = "force-dynamic";

/** Inventory alerts from the stock_alerts API (out-of-stock, below reorder, expiring). */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const daysToExpiry = Math.min(365, Math.max(1, Number.parseInt(days ?? "30", 10) || 30));

  let alerts = null;
  let error: string | null = null;
  try {
    alerts = await fetchStockAlerts(daysToExpiry);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const reorderItems = [
    ...(alerts?.out_of_stock ?? []),
    ...(alerts?.low_stock ?? []),
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventory alerts</h1>
          <div className="desc">
            Out-of-stock, below-reorder and expiry risks · generated{" "}
            {alerts ? new Date(alerts.generated_at).toLocaleString() : "—"}
          </div>
        </div>
        <div className="toolbar" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {alerts && <ReorderExportButton items={reorderItems} />}
          <form className="toolbar" method="get" style={{ margin: 0, padding: 0 }}>
            <label htmlFor="days">Expiry window (days)</label>
            <input id="days" type="number" name="days" min={1} max={365}
                   defaultValue={daysToExpiry} style={{ width: 110 }} />
            <button className="btn primary" type="submit">Apply</button>
          </form>
        </div>
      </div>

      {error && <div className="error-banner">ERP unavailable: {error}</div>}

      {alerts && (
        <>
          <div className="kpi-grid">
            <div className="card kpi">
              <h3>Out of stock</h3>
              <div className="value">{alerts.out_of_stock.length}</div>
              <div className="sub">sellable items at zero/negative stock</div>
            </div>
            <div className="card kpi">
              <h3>Below reorder level</h3>
              <div className="value">{alerts.low_stock.length}</div>
              <div className="sub">per Item Reorder settings</div>
            </div>
            <div className="card kpi">
              <h3>Expiring ≤ {alerts.days_to_expiry} days</h3>
              <div className="value">{alerts.expiring.length}</div>
              <div className="sub">batches with remaining quantity</div>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <h2>Out of stock &amp; low stock</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Item</th><th>Warehouse</th><th className="num">Actual</th>
                        <th className="num">Reorder at</th><th>Flag</th></tr>
                  </thead>
                  <tbody>
                    {alerts.out_of_stock.map((row) => (
                      <StockRow key={`o-${row.item_code}-${row.warehouse}`} row={row} flag="bad" flagLabel="out" />
                    ))}
                    {alerts.low_stock.map((row) => (
                      <StockRow key={`l-${row.item_code}-${row.warehouse}`} row={row} flag="warn" flagLabel="low" />
                    ))}
                    {alerts.out_of_stock.length + alerts.low_stock.length === 0 && (
                      <tr><td colSpan={5}>
                        <div className="empty">
                          <div className="glyph">✓</div>
                          Nothing is out of stock or below its reorder level.
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <h2>Expiring batches</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Batch</th><th>Item</th><th>Expiry</th><th className="num">Qty</th></tr>
                  </thead>
                  <tbody>
                    {alerts.expiring.map((b) => (
                      <tr key={b.batch_id}>
                        <td className="mono">{b.batch_id}</td>
                        <td>{b.item_code}</td>
                        <td>
                          <span className="badge warn">{b.expiry_date}</span>
                        </td>
                        <td className="num">{b.batch_qty}</td>
                      </tr>
                    ))}
                    {alerts.expiring.length === 0 && (
                      <tr><td colSpan={4}>
                        <div className="empty">
                          <div className="glyph">✓</div>
                          No batches expire within {alerts.days_to_expiry} days.
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StockRow({ row, flag, flagLabel }: {
  row: { item_code: string; warehouse: string; actual_qty: number;
         reorder_level: number; reorder_qty: number };
  flag: "bad" | "warn"; flagLabel: string;
}) {
  return (
    <tr>
      <td className="mono">{row.item_code}</td>
      <td className="muted">{row.warehouse}</td>
      <td className="num">{row.actual_qty}</td>
      <td className="num">{row.reorder_level > 0 ? row.reorder_level : "—"}</td>
      <td><span className={`badge ${flag}`}>{flagLabel}</span></td>
    </tr>
  );
}
