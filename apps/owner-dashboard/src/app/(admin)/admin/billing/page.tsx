import React from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { adminListSubscriptions, adminListWebhookEvents } from "@/lib/frappe-server";
import { AdminBillingCorrectionModal } from "./AdminBillingCorrectionModal";
import { AdminWebhookRetryButton } from "./AdminWebhookRetryButton";

export const metadata = {
  title: "SaaS Subscriptions & Billing — Platform Admin",
  description: "Platform-wide commercial oversight, payment reconciliation, webhook audit, and manual corrections.",
};

export default async function AdminBillingConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;

  let subscriptions: any[] = [];
  let webhooks: any[] = [];
  let errorMsg: string | null = null;

  try {
    const subRes = await adminListSubscriptions(status, q, 50);
    subscriptions = subRes?.subscriptions ?? [];

    const hookRes = await adminListWebhookEvents(20);
    webhooks = hookRes?.events ?? [];
  } catch (err: any) {
    errorMsg = err.message || "Failed to query SaaS billing control plane.";
  }

  const badgeColors: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: "#ecfdf5", text: "#065f46" },
    TRIALING: { bg: "#eff6ff", text: "#1e40af" },
    PAST_DUE: { bg: "#fffbeb", text: "#92400e" },
    SUSPENDED: { bg: "#fef2f2", text: "#991b1b" },
    CANCELLED: { bg: "#f3f4f6", text: "#374151" },
    EXPIRED: { bg: "#f3f4f6", text: "#374151" },
  };

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2dd4bf", fontWeight: 700, marginBottom: 4 }}>
            Platform Operations
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)" }}>
            SaaS Subscriptions & Billing Console
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted)", fontSize: 14 }}>
            Central commercial control plane across all tenant workspaces • Provider: <code>Razorpay Sandbox</code>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/admin/onboarding"
            className="btn btn-secondary"
            style={{ textDecoration: "none", fontSize: 13, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ClipboardList size={14} aria-hidden="true" />
            <span>Onboarding Requests</span>
          </Link>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <strong>Platform Admin Query Error:</strong> {errorMsg}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <form method="GET" style={{ display: "flex", gap: 10, flex: 1, minWidth: 280 }}>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by business name, customer email, or subscription ID..."
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              fontSize: 13,
            }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13 }}>
            Search
          </button>
          {q && (
            <Link href="/admin/billing" className="btn btn-secondary" style={{ padding: "8px 12px", fontSize: 13, textDecoration: "none" }}>
              Clear
            </Link>
          )}
        </form>

        <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
          {["ALL", "ACTIVE", "TRIALING", "PAST_DUE", "SUSPENDED", "CANCELLED"].map((st) => {
            const isSelected = (!status && st === "ALL") || status === st;
            return (
              <Link
                key={st}
                href={st === "ALL" ? "/admin/billing" : `/admin/billing?status=${st}`}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected ? "var(--teal-700)" : "#f1f5f9",
                  color: isSelected ? "#ffffff" : "#475569",
                }}
              >
                {st}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Subscriptions Table */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 32 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>
          Active & Historical Customer Subscriptions ({subscriptions.length})
        </div>

        {subscriptions.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", background: "#f8fafc", borderRadius: 8 }}>
            No subscriptions matching the filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Business / Customer</th>
                  <th style={{ padding: "10px 12px" }}>Tenant Workspace</th>
                  <th style={{ padding: "10px 12px" }}>Plan Tier</th>
                  <th style={{ padding: "10px 12px" }}>Subscription Status</th>
                  <th style={{ padding: "10px 12px" }}>Current Period End</th>
                  <th style={{ padding: "10px 12px" }}>Workspace Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Operator Action</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => {
                  const b = badgeColors[s.status] || { bg: "#f3f4f6", text: "#374151" };
                  return (
                    <tr key={s.subscription_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text)" }}>{s.business_name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.customer_email}</div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <code>{s.tenant_slug || s.tenant_id.slice(0, 10)}</code>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{s.plan_id}</span>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.billing_interval}</div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            background: b.bg,
                            color: b.text,
                            padding: "3px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {s.status}
                        </span>
                        {s.cancel_at_period_end && (
                          <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>Cancel at period end</div>
                        )}
                      </td>
                      <td style={{ padding: "12px", color: "var(--muted)", fontSize: 12 }}>
                        {new Date(s.current_period_end).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            background: s.tenant_lifecycle_status === "ACTIVE" ? "#ecfdf5" : "#fef2f2",
                            color: s.tenant_lifecycle_status === "ACTIVE" ? "#065f46" : "#991b1b",
                            padding: "2px 6px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {s.tenant_lifecycle_status}
                        </span>
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <AdminBillingCorrectionModal
                          subscriptionId={s.subscription_id}
                          currentStatus={s.status}
                          businessName={s.business_name}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Webhook Reconciliation Log */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              Payment Provider Webhook Reconciliation Log
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Idempotent processing queue: prevents duplicate invoices or premature activations.
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Latest 20 events</span>
        </div>

        {webhooks.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)", background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
            No webhook events logged yet. Events from Razorpay Sandbox will be logged here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "8px 10px" }}>Event ID</th>
                  <th style={{ padding: "8px 10px" }}>Provider</th>
                  <th style={{ padding: "8px 10px" }}>Event Type</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Processed At</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.event_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px" }}><code>{w.event_id}</code></td>
                    <td style={{ padding: "10px" }}>{w.provider}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{w.event_type}</td>
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          background: w.status === "PROCESSED" ? "#ecfdf5" : w.status === "FAILED" ? "#fef2f2" : "#f1f5f9",
                          color: w.status === "PROCESSED" ? "#065f46" : w.status === "FAILED" ? "#991b1b" : "#475569",
                          padding: "2px 6px",
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px", color: "var(--muted)" }}>
                      {w.processed_at ? new Date(w.processed_at).toLocaleString() : "Pending"}
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <AdminWebhookRetryButton eventId={w.event_id} status={w.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
