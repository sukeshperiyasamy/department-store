import React from "react";
import Link from "next/link";
import { getAvailablePlans, getBillingOverview } from "@/lib/frappe-server";
import { PlanCheckoutButton } from "./PlanCheckoutButton";

export const metadata = {
  title: "Subscription Plans & Entitlements — Department Store Manager",
  description: "Compare available subscription plans, counter limits, and upgrade your tier.",
};

export default async function BillingPlansPage() {
  const tenantId = process.env.TEST_TENANT_ID ?? "880e8400-e29b-41d4-a716-446655440002";
  let plans: any[] = [];
  let currentPlanId = "starter";

  try {
    const plansRes = await getAvailablePlans();
    plans = plansRes?.plans ?? [];
    const overview = await getBillingOverview(tenantId);
    currentPlanId = overview?.subscription?.plan_id ?? "starter";
  } catch (e) {
    // Fallback plans if backend temporarily unavailable
    plans = [
      {
        plan_id: "starter",
        version: 1,
        name: "Starter Store",
        description: "Essential POS billing and catalog management for single-counter retail shops.",
        price_paise: 149900,
        billing_interval: "MONTHLY",
        entitlements: { max_counters: 1, max_skus: 5000, max_users: 2 },
        features: [
          "1 Windows POS billing counter terminal",
          "Full offline SQLite durable transaction queue",
          "Item catalog up to 5,000 SKUs",
          "Shared mobile web dashboard access",
          "Standard India GST invoices & reporting",
        ],
      },
      {
        plan_id: "growth",
        version: 1,
        name: "Growth Multi-Counter",
        description: "High-throughput billing and inventory tracking for departmental stores with 2-5 counters.",
        price_paise: 349900,
        billing_interval: "MONTHLY",
        entitlements: { max_counters: 5, max_skus: 50000, max_users: 10 },
        features: [
          "Up to 5 concurrent Windows POS counters",
          "Multi-counter claim-based deduplication",
          "Item catalog up to 50,000 SKUs",
          "Batch tracking & expiry notifications (7/30/60 day alerts)",
          "ZPL / TSPL barcode label printing engine",
          "Shared platform mobile app access",
          "Priority email & WhatsApp support",
        ],
      },
      {
        plan_id: "enterprise",
        version: 1,
        name: "Departmental Premium",
        description: "Full-scale departmental store operations with high concurrency and premium support.",
        price_paise: 999900,
        billing_interval: "MONTHLY",
        entitlements: { max_counters: 25, max_skus: 500000, max_users: 50 },
        features: [
          "Up to 25 Windows POS counter terminals",
          "High-concurrency MariaDB optimization & tuning",
          "Unlimited catalog SKUs and multi-warehouse support",
          "Dedicated custom branding options",
          "Enterprise SLA & custom disaster recovery replication",
          "24/7 emergency response & account engineer",
        ],
      },
    ];
  }

  return (
    <div style={{ padding: "24px 0", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/billing" style={{ fontSize: 13, color: "var(--teal-700)", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Billing Overview
        </Link>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "12px 0 6px 0", color: "var(--text)" }}>
          Available Subscription Plans
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
          Select the capacity tier matching your store&apos;s checkout counters and inventory scale. Changes take effect immediately in Sandbox mode.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginBottom: 32 }}>
        {plans.map((p) => {
          const isCurrent = p.plan_id === currentPlanId;
          const isGrowth = p.plan_id === "growth";
          return (
            <div
              key={p.plan_id}
              style={{
                background: "#ffffff",
                border: isCurrent ? "2px solid var(--teal-600)" : isGrowth ? "2px solid #0d9488" : "1px solid var(--border)",
                borderRadius: 12,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                boxShadow: isGrowth ? "0 4px 14px rgba(13, 148, 136, 0.12)" : "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              {isGrowth && !isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    right: 20,
                    background: "var(--teal-600)",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 10px",
                    borderRadius: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Most Popular
                </div>
              )}

              {isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: 20,
                    background: "#065f46",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 10px",
                    borderRadius: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Current Active Plan
                </div>
              )}

              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, minHeight: 38 }}>
                {p.description}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "16px 0", marginBottom: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: "var(--text)" }}>
                  ₹{(p.price_paise / 100).toLocaleString("en-IN")}
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}> / month (+18% GST)</span>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  Capacity & Limits
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text)", lineHeight: 1.8 }}>
                  <li><strong>{p.entitlements.max_counters}</strong> POS Billing Counter{p.entitlements.max_counters > 1 ? "s" : ""}</li>
                  <li><strong>{p.entitlements.max_skus.toLocaleString("en-IN")}</strong> Catalog SKUs</li>
                  <li><strong>{p.entitlements.max_users}</strong> Authorized Staff Seats</li>
                </ul>
              </div>

              <div style={{ flex: 1, marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  Included Features
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
                  {p.features.map((feat: string, i: number) => (
                    <li key={i}>{feat}</li>
                  ))}
                </ul>
              </div>

              <div>
                {isCurrent ? (
                  <button
                    disabled
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#f1f5f9",
                      color: "#64748b",
                      fontWeight: 700,
                      cursor: "not-allowed",
                    }}
                  >
                    Current Plan
                  </button>
                ) : (
                  <PlanCheckoutButton tenantId={tenantId} planId={p.plan_id} planName={p.name} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, fontSize: 12, color: "#64748b" }}>
        <strong>Sandbox Billing Mode:</strong> Selecting a plan triggers an authenticated checkout session with Razorpay Sandbox credentials. No real charges are debited during development and testing.
      </div>
    </div>
  );
}
