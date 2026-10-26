import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { fetchOwnerSummary, fetchServerStatus } from "@/lib/frappe-server";
import { Nav } from "@/components/Nav";
import { SalesCharts } from "@/components/SalesCharts";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const hasSession = Boolean((await cookies()).get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);
  if (!hasSession && !hasToken) redirect("/login");

  let summary = null;
  let status = null;
  let loadError: string | null = null;
  try {
    [summary, status] = await Promise.all([fetchOwnerSummary(), fetchServerStatus()]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <main className="page">
      <Nav active="/" />
      {loadError && <div className="error-banner">ERP unavailable: {loadError}</div>}
      {summary && (
        <>
          <div className="grid">
            <Metric title="Gross sales (today)" value={formatINR(summary.gross_sales)}
                    sub={`${summary.bills} bills · avg ${formatINR(summary.average_bill_value)}`} />
            <Metric title="Net sales (tax excl.)" value={formatINR(summary.net_sales_after_returns)}
                    sub={`returns ${formatINR(summary.returns_total)} (${summary.returns_count})`} />
            <Metric title="GST collected" value={formatINR(summary.taxes_collected)} />
            <Metric title="Sync review queue" value={String(status?.review_queue.length ?? 0)}
                    sub={status && status.review_queue.length > 0 ? "needs attention" : "clear"} />
          </div>
          <div className="panel">
            <h2>Payment mix &amp; cashier performance</h2>
            <SalesCharts
              paymentSplit={summary.payment_split}
              cashierSplit={summary.cashier_split}
            />
          </div>
        </>
      )}
      {status && (
        <div className="panel">
          <h2>Counter health</h2>
          <table>
            <thead>
              <tr>
                <th>Counter</th>
                <th>Status</th>
                <th>Last successful sync</th>
              </tr>
            </thead>
            <tbody>
              {status.devices.map((device) => (
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
              {status.devices.length === 0 && (
                <tr><td colSpan={3} className="muted">No counters registered yet.</td></tr>
              )}
            </tbody>
          </table>
          <p className="muted">
            Data as of {new Date(summary?.generated_at ?? status.generated_at).toLocaleString()} —
            figures are ERP-verified, not cached.
          </p>
        </div>
      )}
    </main>
  );
}

function Metric({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
