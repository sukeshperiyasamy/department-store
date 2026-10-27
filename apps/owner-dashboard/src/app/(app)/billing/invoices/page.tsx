import React from "react";
import Link from "next/link";
import { getBillingOverview } from "@/lib/frappe-server";

export const metadata = {
  title: "Platform Invoices — Department Store Manager",
  description: "View and download SaaS subscription platform invoices and GST receipts.",
};

export default async function BillingInvoicesPage() {
  const tenantId = process.env.TEST_TENANT_ID ?? "880e8400-e29b-41d4-a716-446655440002";
  let invoices: any[] = [];
  let businessName = "Department Store";

  try {
    const overview = await getBillingOverview(tenantId);
    invoices = overview?.recent_invoices ?? [];
    businessName = overview?.customer?.business_name ?? "Department Store";
  } catch (e) {
    invoices = [];
  }

  return (
    <div style={{ padding: "24px 0", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/billing" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Billing Overview
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 6px 0", color: "var(--text)" }}>
          Platform Billing Invoices
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          Historical records of subscription license fees and GST tax receipts issued to <strong>{businessName}</strong>.
        </p>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 24 }}>
        {invoices.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>No platform invoices found</div>
            <div style={{ fontSize: 13 }}>
              When a subscription renewal or plan change is paid, your B2B tax invoice will appear here automatically.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "10px 12px" }}>Invoice Number</th>
                  <th style={{ padding: "10px 12px" }}>Billing Period</th>
                  <th style={{ padding: "10px 12px" }}>Subtotal</th>
                  <th style={{ padding: "10px 12px" }}>GST (18%)</th>
                  <th style={{ padding: "10px 12px" }}>Total</th>
                  <th style={{ padding: "10px 12px" }}>Payment Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Download</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoice_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px", fontWeight: 700 }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px", color: "var(--muted)" }}>
                      {new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px" }}>₹{(inv.subtotal_paise / 100).toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px", color: "var(--muted)" }}>₹{(inv.tax_paise / 100).toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px", fontWeight: 800 }}>₹{(inv.total_paise / 100).toLocaleString("en-IN")}</td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          background: inv.payment_status === "PAID" ? "#ecfdf5" : "#fef2f2",
                          color: inv.payment_status === "PAID" ? "#065f46" : "#991b1b",
                          padding: "3px 8px",
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
                        style={{ color: "var(--teal-700)", textDecoration: "none", fontWeight: 600, fontSize: 12 }}
                      >
                        Download PDF ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, fontSize: 12, color: "#64748b" }}>
        <strong>Accounting Note:</strong> These invoices represent B2B software license fees paid to the SaaS platform operator. They are strictly separate from your daily grocery sales receipts and customer returns.
      </div>
    </div>
  );
}
