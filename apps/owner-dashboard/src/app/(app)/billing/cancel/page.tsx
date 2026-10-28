import React from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getBillingOverview } from "@/lib/frappe-server";
import { CancelSubscriptionForm } from "./CancelSubscriptionForm";

export const metadata = {
  title: "Cancel Subscription — Department Store Manager",
  description: "Subscription cancellation workflow with documented data retention guarantees.",
};

export default async function CancelBillingPage() {
  const tenantId = process.env.TEST_TENANT_ID ?? "880e8400-e29b-41d4-a716-446655440002";
  let overview: any = null;

  try {
    overview = await getBillingOverview(tenantId);
  } catch (e) {
    // fallback
  }

  const sub = overview?.subscription;
  const currentPeriodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : "end of the billing cycle";

  return (
    <div style={{ padding: "24px 0", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/billing" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Back to Billing Overview</span>
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 6px 0", color: "#991b1b" }}>
          Cancel Store Subscription
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          We&apos;re sorry to see you consider cancelling. Please review our data retention terms before proceeding.
        </p>
      </div>

      {/* Retention Guarantee Box */}
      <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={18} color="var(--accent)" aria-hidden="true" />
          <span>90-Day Safe Data Retention Guarantee</span>
        </div>
        <p style={{ margin: "0 0 10px 0", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
          <strong>Your store records will NOT be deleted.</strong> When you cancel your subscription:
        </p>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
          <li>All historical sales invoices, payments, and GST tax logs remain securely archived in your isolated database.</li>
          <li>Your item catalog, barcode configurations, and customer ledger will be preserved for at least <strong>90 days</strong>.</li>
          <li>You can reactivate your account at any time without rebuilding your store or re-entering data.</li>
        </ul>
      </div>

      {/* Cancellation Form Component */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <CancelSubscriptionForm tenantId={tenantId} currentPeriodEnd={currentPeriodEnd} />
      </div>
    </div>
  );
}
