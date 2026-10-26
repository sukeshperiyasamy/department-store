import Link from "next/link";
import {
  fetchOwnerSummary,
  fetchRecentInvoices,
  fetchServerStatus,
} from "@/lib/frappe-server";
import { formatINR } from "@/lib/format";
import { SalesCharts } from "@/components/SalesCharts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const businessDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date : undefined;

  let summary = null;
  let status = null;
  let invoices: Awaited<ReturnType<typeof fetchRecentInvoices>> = [];
  let loadError: string | null = null;
  try {
    [summary, status, invoices] = await Promise.all([
      fetchOwnerSummary(businessDate),
      fetchServerStatus(),
      fetchRecentInvoices(8),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  const reviewCount = status?.review_queue.length ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="desc">
            Store performance for <strong>{summary?.business_date ?? businessDate ?? "today"}</strong>
            {summary && <> · data generated {new Date(summary.generated_at).toLocaleString()}</>}
          </div>
        </div>
        <form className="toolbar" method="get">
          <label htmlFor="date">Business date</label>
          <input id="date" type="date" name="date" defaultValue={summary?.business_date} />
          <button className="btn primary" type="submit">Apply</button>
        </form>
      </div>

      {loadError && <div className="error-banner">ERP unavailable: {loadError}</div>}

      {summary && (
        <>
          <div className="kpi-grid">
            <Kpi title="Gross sales" value={formatINR(summary.gross_sales)}
                 sub={`${summary.bills} bills · avg ${formatINR(summary.average_bill_value)}`} />
            <Kpi title="Net sales (tax excl.)" value={formatINR(summary.net_sales_after_returns)}
                 sub={`returns ${formatINR(summary.returns_total)} across ${summary.returns_count} bills`} />
            <Kpi title="GST collected" value={formatINR(summary.taxes_collected)}
                 sub="from ERP tax engine" />
            <Kpi title="Sync review queue" value={String(reviewCount)}
                 sub={reviewCount > 0 ? "bills need attention" : "nothing pending"}
                 tone={reviewCount > 0 ? "warn" : "ok"} href="/sync" />
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Payment mix &amp; cashier performance</h2>
              <Link className="muted" href="/sales">All sales →</Link>
            </div>
            <SalesCharts paymentSplit={summary.payment_split} cashierSplit={summary.cashier_split} />
            <p className="charts-note">
              Payment split shows allocated amounts (cash excludes change given).
            </p>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <h2>Recent bills</h2>
                <Link className="muted" href="/sales">View all →</Link>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Invoice</th><th>Customer</th><th>Time</th><th className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.name}>
                        <td className="mono">{inv.name}</td>
                        <td>{inv.customer ?? "—"}</td>
                        <td className="muted">
                          {inv.posting_date} {inv.posting_time?.slice(0, 5) ?? ""}
                        </td>
                        <td className="num">
                          {inv.is_return ? "-" : ""}{formatINR(Math.abs(inv.base_grand_total))}
                        </td>
                      </tr>
                    ))}
                    {invoices.length === 0 && (
                      <tr><td colSpan={4} className="muted">No bills yet for this period.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Counter health</h2>
                <Link className="muted" href="/sync">Sync details →</Link>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Counter</th><th>Status</th><th>Last sync</th></tr>
                  </thead>
                  <tbody>
                    {(status?.devices ?? []).map((device) => (
                      <tr key={device.device_id}>
                        <td>{device.counter_name ?? device.device_id}</td>
                        <td>
                          <span className={`badge ${device.status === "Enabled" ? "ok" : "bad"}`}>
                            {device.status}
                          </span>
                        </td>
                        <td className="muted">
                          {device.last_sync_at ? new Date(device.last_sync_at).toLocaleString() : "never"}
                        </td>
                      </tr>
                    ))}
                    {(status?.devices ?? []).length === 0 && (
                      <tr><td colSpan={3} className="muted">No counters registered yet.</td></tr>
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

function Kpi({ title, value, sub, tone, href }: {
  title: string; value: string; sub?: string; tone?: "ok" | "warn"; href?: string;
}) {
  const body = (
    <div className="card kpi">
      <h3>{title}</h3>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
      {tone && <span className={`badge ${tone}`}>{tone === "warn" ? "needs attention" : "healthy"}</span>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>{body}</Link> : body;
}
