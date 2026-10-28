import React from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Check, Download, FileText, Scale, Zap } from "lucide-react";
import { getBillingOverview } from "@/lib/frappe-server";

export const metadata = {
  title: "Subscription & Billing — Department Store Manager",
  description: "Manage your SaaS subscription, plan entitlements, payment status, and invoices.",
};

export default async function BillingOverviewPage() {
  // Default to primary test tenant or first available tenant in dev/test
  const tenantId = process.env.TEST_TENANT_ID ?? "880e8400-e29b-41d4-a716-446655440002";
  let overview: any = null;
  let loadError: string | null = null;

  try {
    overview = await getBillingOverview(tenantId);
  } catch (err: any) {
    loadError = err.message || "Failed to load billing overview from backend.";
  }

  const sub = overview?.subscription;
  const plan = overview?.plan;
  const entitlements = overview?.entitlements;
  const customer = overview?.customer;
  const activeCounters = overview?.counters_active ?? 0;
  const maxCounters = overview?.counters_limit ?? 1;

  const status = sub?.status ?? "TRIALING";
  const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
    ACTIVE: { bg: "#ecfdf5", text: "#065f46", border: "#a7f3d0" },
    TRIALING: { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
    PAST_DUE: { bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
    SUSPENDED: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
    CANCELLED: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
    EXPIRED: { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" },
  };
  const badge = badgeColors[status] ?? { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" };

  return (
    <div style={{ padding: "24px 0", maxWidth: 1100, margin: "0 auto" }}>
      {/* Title & Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Commercial Control Plane
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "var(--text)" }}>
            Subscription & Billing
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted)", fontSize: 14 }}>
            Shop Account: <strong>{customer?.business_name ?? "Department Store"}</strong> • Tenant ID: <code style={{ fontSize: 12 }}>{tenantId.slice(0, 13)}...</code>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/billing/plans"
            className="btn btn-primary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <Zap size={14} aria-hidden="true" />
            <span>Switch Plan</span>
          </Link>
          <Link
            href="/billing/invoices"
            className="btn btn-secondary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <FileText size={14} aria-hidden="true" />
            <span>Invoices</span>
          </Link>
          <Link
            href="/billing/usage"
            className="btn btn-secondary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
          >
            <BarChart3 size={14} aria-hidden="true" />
            <span>Usage</span>
          </Link>
        </div>
      </div>

      {loadError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 16, borderRadius: 8, marginBottom: 24 }}>
          <strong>ERP Connection Issue:</strong> {loadError}
          <div style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 12, alignItems: "center" }}>
            <span>Real billing data could not be retrieved from Frappe/ERPNext backend.</span>
            <Link href="/billing" style={{ color: "#991b1b", fontWeight: 600, textDecoration: "underline" }}>
              Retry Connection
            </Link>
          </div>
        </div>
      )}

      {/* Main Grid: Plan Card & Entitlements */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* Active Subscription Card */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Current Subscription</span>
            <span
              style={{
                background: badge.bg,
                color: badge.text,
                border: `1px solid ${badge.border}`,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              ● {status}
            </span>
          </div>

          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
            {plan?.name ?? "Starter Store Plan"}
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>
            {plan?.description ?? "Essential POS billing and catalog management for single-counter retail shops."}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <span style={{ fontSize: 28, fontWeight: 900, color: "var(--text)" }}>
                ₹{((plan?.price_paise ?? 149900) / 100).toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}> / month</span>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>
              {sub?.current_period_end ? (
                <>Next renewal: <strong>{new Date(sub.current_period_end).toLocaleDateString()}</strong></>
              ) : (
                <>Trial active</>
              )}
            </div>
          </div>

          {sub?.cancel_at_period_end && (
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={15} color="#92400e" aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>Scheduled to cancel at the end of the billing period. All store records remain safely archived.</span>
            </div>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <Link
              href="/billing/plans"
              className="btn btn-primary"
              style={{ flex: 1, textAlign: "center", textDecoration: "none", fontSize: 13, padding: "8px 12px" }}
            >
              Upgrade / Change Tier
            </Link>
            {!sub?.cancel_at_period_end && (
              <Link
                href="/billing/cancel"
                className="btn btn-secondary"
                style={{ textAlign: "center", textDecoration: "none", fontSize: 13, color: "#991b1b", borderColor: "#fecaca", padding: "8px 12px" }}
              >
                Cancel
              </Link>
            )}
          </div>
        </div>

        {/* Entitlements & Capacity Card */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>
            Server-Enforced Entitlements
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>Windows POS Billing Counters</span>
                <span><strong>{activeCounters}</strong> of {maxCounters} allowed</span>
              </div>
              <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (activeCounters / maxCounters) * 100)}%`,
                    background: activeCounters >= maxCounters ? "#f59e0b" : "var(--teal-600)",
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Catalog SKU Limit</span>
              <strong>{(entitlements?.max_skus ?? 5000).toLocaleString("en-IN")} items</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Employee User Accounts</span>
              <strong>{(entitlements?.max_users ?? 2)} seats</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Shared Mobile App Access</span>
              <span style={{ color: "#065f46", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={13} aria-hidden="true" />
                <span>Included</span>
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8, fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Batch & Expiry Alert Engine</span>
              <span>{entitlements?.batch_expiry_tracking ? (
                <strong style={{ color: "#065f46", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={13} aria-hidden="true" />
                  <span>Enabled</span>
                </strong>
              ) : (
                <span style={{ color: "var(--muted)" }}>Growth Tier</span>
              )}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "var(--muted)" }}>Automatic Local Backup Runner</span>
              <span style={{ color: "#065f46", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={13} aria-hidden="true" />
                <span>Enabled</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices Section */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            Recent Platform Invoices
          </h2>
          <Link href="/billing/invoices" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", fontWeight: 600 }}>
            View Full History →
          </Link>
        </div>

        {(!overview?.recent_invoices || overview.recent_invoices.length === 0) ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", background: "#f8fafc", borderRadius: 8 }}>
            No platform subscription invoices issued yet. Invoices appear automatically after successful renewal or upgrade payments.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Invoice #</th>
                  <th style={{ padding: "10px 12px" }}>Billing Period</th>
                  <th style={{ padding: "10px 12px" }}>Amount</th>
                  <th style={{ padding: "10px 12px" }}>GST (18%)</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent_invoices.slice(0, 5).map((inv: any) => (
                  <tr key={inv.invoice_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px", fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px", color: "var(--muted)" }}>
                      {new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700 }}>
                      ₹{(inv.total_paise / 100).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "12px", color: "var(--muted)" }}>
                      ₹{(inv.tax_paise / 100).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          background: inv.payment_status === "PAID" ? "#ecfdf5" : "#fef2f2",
                          color: inv.payment_status === "PAID" ? "#065f46" : "#991b1b",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {inv.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <a
                        href={inv.pdf_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--teal-700)", textDecoration: "none", fontWeight: 600, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <span>Download PDF</span>
                        <Download size={12} aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accounting & Legal Boundary Disclaimers */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <Scale size={16} aria-hidden="true" />
          <span>Accounting & Legal Separation Boundary</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          <li>
            <strong>Separate Financial Ledgers:</strong> SaaS subscription charges represent platform software hosting and licenses issued by the SaaS operator. They are strictly separate from your retail store POS sales, grocery inventory, and store GST filings.
          </li>
          <li>
            <strong>Tax Treatment:</strong> B2B SaaS platform invoices are issued under GST SAC 998315 (Software as a Service) at 18% GST.
          </li>
          <li>
            <strong>Data Retention & Decommissioning:</strong> Cancelling your subscription does not delete your store database. Under our retention policy, your retail records remain safely archived for 90 days.
          </li>
        </ul>
      </div>
    </div>
  );
}
