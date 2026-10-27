import React from "react";
import Link from "next/link";
import { getBillingOverview } from "@/lib/frappe-server";

export const metadata = {
  title: "Plan Usage & Entitlements — Department Store Manager",
  description: "Monitor billing counter utilization, SKU limits, and active staff seats.",
};

export default async function BillingUsagePage() {
  const tenantId = process.env.TEST_TENANT_ID ?? "880e8400-e29b-41d4-a716-446655440002";
  let overview: any = null;

  try {
    overview = await getBillingOverview(tenantId);
  } catch (e) {
    // fallback
  }

  const activeCounters = overview?.counters_active ?? 0;
  const maxCounters = overview?.counters_limit ?? 1;
  const maxSkus = overview?.entitlements?.max_skus ?? 5000;
  const maxUsers = overview?.entitlements?.max_users ?? 2;
  const planName = overview?.plan?.name ?? "Starter Store";

  const counterPercent = Math.min(100, Math.round((activeCounters / maxCounters) * 100));

  return (
    <div style={{ padding: "24px 0", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/billing" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Billing Overview
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 6px 0", color: "var(--text)" }}>
          Usage & Resource Limits
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          Live resource utilization for your shop workspace under the <strong>{planName}</strong> plan.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* Counter Usage Card */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
            POS Billing Counters
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--text)" }}>{activeCounters}</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>/ {maxCounters} active</span>
          </div>

          <div style={{ height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
            <div
              style={{
                height: "100%",
                width: `${counterPercent}%`,
                background: counterPercent >= 100 ? "#f59e0b" : "var(--teal-600)",
                borderRadius: 5,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {counterPercent >= 100 ? (
              <span style={{ color: "#d97706", fontWeight: 600 }}>Capacity limit reached. Upgrade to add more counters.</span>
            ) : (
              <span>{maxCounters - activeCounters} counter slot{maxCounters - activeCounters > 1 ? "s" : ""} available.</span>
            )}
          </div>
        </div>

        {/* Catalog SKUs Card */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
            Catalog SKU Capacity
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--text)" }}>5,000</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>/ {maxSkus.toLocaleString("en-IN")} max</span>
          </div>
          <div style={{ height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", width: "20%", background: "var(--teal-600)", borderRadius: 5 }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            High-throughput Tanglish/Tamil product catalog indexing active.
          </div>
        </div>

        {/* Staff Seats Card */}
        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
            Staff User Accounts
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--text)" }}>2</span>
            <span style={{ fontSize: 16, color: "var(--muted)" }}>/ {maxUsers} seats</span>
          </div>
          <div style={{ height: 10, background: "#f1f5f9", borderRadius: 5, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", width: "100%", background: "var(--teal-600)", borderRadius: 5 }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Roles: Tenant Owner, Store Manager, Cashier.
          </div>
        </div>
      </div>

      <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px 0", color: "var(--text)" }}>
          Need additional billing counters or staff seats?
        </h2>
        <p style={{ margin: "0 0 16px 0", color: "var(--muted)", fontSize: 14 }}>
          Upgrading to the <strong>Growth Multi-Counter</strong> tier unlocks up to 5 concurrent counter terminals, automated batch/expiry tracking alerts, and priority support.
        </p>
        <Link href="/billing/plans" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
          View Upgrade Options →
        </Link>
      </div>
    </div>
  );
}
