import { fetchRecentInvoices } from "@/lib/frappe-server";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** Submitted invoices via the standard ERPNext REST API (read-only). */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  let invoices: Awaited<ReturnType<typeof fetchRecentInvoices>> = [];
  let error: string | null = null;
  try {
    invoices = await fetchRecentInvoices(100);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const start = (pageNum - 1) * PAGE_SIZE;
  const pageItems = invoices.slice(start, start + PAGE_SIZE);
  const lastPage = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const gross = invoices.filter((i) => !i.is_return).reduce((s, i) => s + i.base_grand_total, 0);
  const returns = invoices.filter((i) => i.is_return).reduce((s, i) => s + i.base_grand_total, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sales</h1>
          <div className="desc">
            Last {invoices.length} submitted bills · totals from ERP (tax inclusive)
          </div>
        </div>
      </div>

      {error && <div className="error-banner">ERP unavailable: {error}</div>}

      <div className="kpi-grid">
        <div className="card kpi">
          <h3>Gross (this page of results)</h3>
          <div className="value">{formatINR(gross)}</div>
          <div className="sub">{invoices.filter((i) => !i.is_return).length} bills</div>
        </div>
        <div className="card kpi">
          <h3>Returns (this page)</h3>
          <div className="value">{formatINR(returns)}</div>
          <div className="sub">{invoices.filter((i) => i.is_return).length} credit notes</div>
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date &amp; time</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((inv) => (
                <tr key={inv.name}>
                  <td className="mono">{inv.name}</td>
                  <td className="muted">
                    {inv.posting_date} {inv.posting_time?.slice(0, 5) ?? ""}
                  </td>
                  <td>{inv.customer ?? "—"}</td>
                  <td className="muted">{inv.owner ?? "—"}</td>
                  <td>
                    {inv.is_return ? (
                      <span className="badge warn">return</span>
                    ) : (
                      <span className={`badge ${inv.status === "Paid" ? "ok" : "info"}`}>
                        {inv.status}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {inv.is_return ? "-" : ""}{formatINR(Math.abs(inv.base_grand_total))}
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <div className="glyph">₹</div>
                      No submitted bills yet. Complete a sale at a counter and it will appear here.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lastPage > 1 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Page {pageNum} of {lastPage} ·{" "}
            {pageNum > 1 && <a href={`/sales?page=${pageNum - 1}`}>← prev</a>}
            {" · "}
            {pageNum < lastPage && <a href={`/sales?page=${pageNum + 1}`}>next →</a>}
          </p>
        )}
      </div>
    </>
  );
}
