import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchServerStatus } from "@/lib/frappe-server";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

/** Sync & server health: devices, processing backlog, review queue. */
export default async function SyncPage() {
  const hasSession = Boolean((await cookies()).get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);
  if (!hasSession && !hasToken) redirect("/login");

  let status = null;
  let error: string | null = null;
  try {
    status = await fetchServerStatus();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="page">
      <Nav active="/sync" />
      {error && <div className="error-banner">ERP unavailable: {error}</div>}
      {status && (
        <>
          <div className="panel">
            <h2>Server</h2>
            <p className="muted">
              Frappe {status.frappe_version ?? "?"} · apps: {(status.apps ?? []).join(", ")} ·
              checked {new Date(status.generated_at).toLocaleString()}
            </p>
          </div>
          <div className="panel">
            <h2>Review queue ({status.review_queue.length})</h2>
            <table>
              <thead>
                <tr><th>Transaction</th><th>Error</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {status.review_queue.map((row) => (
                  <tr key={row.transaction_id}>
                    <td><code>{row.transaction_id}</code></td>
                    <td>
                      <span className="badge warn">{row.error_code}</span> {row.error_message}
                    </td>
                    <td className="muted">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {status.review_queue.length === 0 && (
                  <tr><td colSpan={3} className="muted">Nothing needs review.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h2>Processing backlog ({status.processing_transactions.length})</h2>
            {status.processing_transactions.length === 0 ? (
              <p className="muted">No transactions are being processed right now.</p>
            ) : (
              <ul>
                {status.processing_transactions.map((id) => (
                  <li key={id}><code>{id}</code></li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
