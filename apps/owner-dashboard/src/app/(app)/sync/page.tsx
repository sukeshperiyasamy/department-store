import { CheckCircle2 } from "lucide-react";
import { fetchServerStatus } from "@/lib/frappe-server";

export const dynamic = "force-dynamic";

/** Sync & server health: devices, processing backlog, review queue. */
export default async function SyncPage() {
  let status = null;
  let error: string | null = null;
  try {
    status = await fetchServerStatus();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sync &amp; Health</h1>
          <div className="desc">
            Counter synchronization state, review queue and server information
            {status ? ` · checked ${new Date(status.generated_at).toLocaleString()}` : ""}
          </div>
        </div>
      </div>

      {error && <div className="error-banner">ERP unavailable: {error}</div>}

      {status && (
        <>
          <div className="kpi-grid">
            <div className="card kpi">
              <h3>Registered counters</h3>
              <div className="value">{status.devices.length}</div>
              <div className="sub">{status.devices.filter((d) => d.status === "Enabled").length} enabled</div>
            </div>
            <div className="card kpi">
              <h3>Review queue</h3>
              <div className="value">{status.review_queue.length}</div>
              <div className="sub">{status.review_queue.length > 0 ? "bills need a manager" : "clear"}</div>
            </div>
            <div className="card kpi">
              <h3>Processing now</h3>
              <div className="value">{status.processing_transactions.length}</div>
              <div className="sub">claims being posted server-side</div>
            </div>
            <div className="card kpi">
              <h3>ERP version</h3>
              <div className="value" style={{ fontSize: 20 }}>{status.frappe_version ?? "—"}</div>
              <div className="sub">{(status.apps ?? []).join(", ")}</div>
            </div>
          </div>

          <div className="panel">
            <h2>Counters</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Counter</th><th>Device ID</th><th>Status</th><th>Last successful sync</th></tr>
                </thead>
                <tbody>
                  {status.devices.map((device) => (
                    <tr key={device.device_id}>
                      <td>{device.counter_name ?? "—"}</td>
                      <td className="mono">{device.device_id}</td>
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
                    <tr><td colSpan={4}>
                      <div className="empty">
                        <div className="glyph">⇅</div>
                        No counters registered yet. Sign in from a POS counter to register one.
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Review queue ({status.review_queue.length})</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Transaction</th><th>Error</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {status.review_queue.map((row) => (
                    <tr key={row.transaction_id}>
                      <td className="mono">{row.transaction_id}</td>
                      <td>
                        <span className="badge warn">{row.error_code}</span>{" "}
                        <span className="muted">{row.error_message}</span>
                      </td>
                      <td className="muted">{new Date(row.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {status.review_queue.length === 0 && (
                    <tr><td colSpan={3}>
                      <div className="empty">
                        <div className="glyph"><CheckCircle2 size={36} color="var(--accent)" aria-hidden="true" /></div>
                        Nothing needs review — all synced bills posted cleanly.
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {status.processing_transactions.length > 0 && (
            <div className="panel">
              <h2>Processing backlog ({status.processing_transactions.length})</h2>
              <ul>
                {status.processing_transactions.map((id) => (
                  <li key={id}><code>{id}</code></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
