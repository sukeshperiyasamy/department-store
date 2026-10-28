import Link from "next/link";
import { Check } from "lucide-react";
import { SAAS_PLANS, PRICING_DISCLAIMERS } from "@/lib/pricing";

export const metadata = {
  title: "Subscription Plans & Pricing — Department Store ERP",
  description:
    "Transparent proposed subscription plans for single-counter shops and multi-counter departmental stores.",
};

export default function PricingPage() {
  return (
    <div>
      {/* Header */}
      <section className="mkt-hero" style={{ padding: "60px 0 40px" }}>
        <div className="mkt-container">
          <div className="mkt-hero-badge">
            <span>Transparent Plan Structure</span>
          </div>
          <h1 style={{ fontSize: 38 }}>
            Predictable Plans for Retail Businesses of Any Scale
          </h1>
          <p style={{ maxWidth: 740 }}>
            Whether you run a single neighborhood grocery counter or a multi-floor departmental store, our plans include native Windows billing, resilient offline sync, and authoritative ERPNext management.
          </p>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div className="pricing-grid">
            {SAAS_PLANS.map((plan) => {
              const priceDisplay =
                plan.indicativePriceINR !== null
                  ? `₹ ${plan.indicativePriceINR.toLocaleString("en-IN")}`
                  : "Custom";

              return (
                <div key={plan.id} className={`pricing-card ${plan.isPopular ? "popular" : ""}`}>
                  {plan.isPopular && <div className="popular-badge">Recommended</div>}

                  <div>
                    <h3 style={{ fontSize: "var(--fs-2xl)", margin: "0 0 8px", color: "var(--text)" }}>
                      {plan.name}
                    </h3>
                    <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", minHeight: 40, margin: 0 }}>
                      {plan.tagline}
                    </p>

                    <div className="plan-price">
                      <span className="plan-amount">{priceDisplay}</span>
                      {plan.indicativePriceINR !== null && (
                        <span className="plan-freq">/ month (indicative)</span>
                      )}
                    </div>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", marginBottom: 18 }}>
                      {plan.billingFrequency}
                    </div>

                    <div style={{ background: "var(--surface)", padding: 12, borderRadius: 6, marginBottom: 18, fontSize: 13 }}>
                      <strong>Counters:</strong> Up to {plan.maxCounters} {plan.maxCounters === 1 ? "Counter" : "Counters"}
                    </div>

                    <ul className="plan-features">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="plan-feature-item">
                          <span className="plan-feature-check">
                            <Check size={12} aria-hidden="true" />
                          </span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Mobile App Disclosure */}
                    <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 14, marginTop: 14, fontSize: 12, color: "var(--muted)" }}>
                      <strong style={{ color: "var(--text)" }}>Mobile Access:</strong> {plan.mobileAccessNotes}
                    </div>

                    {/* Support Level */}
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                      <strong style={{ color: "var(--text)" }}>Support:</strong> {plan.supportLevel}
                    </div>
                  </div>

                  <div style={{ marginTop: 28 }}>
                    <Link
                      href={plan.ctaHref}
                      className={`btn ${plan.isPopular ? "btn-primary" : "btn-outline"}`}
                      style={{ width: "100%", justifyContent: "center", padding: "12px 18px", fontSize: 15 }}
                    >
                      {plan.ctaText}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pricing Disclaimers / Commercial Boundaries */}
          <div style={{ marginTop: 48, background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 28 }}>
            <h4 style={{ margin: "0 0 14px", fontSize: "var(--fs-md)", color: "var(--text)" }}>
              Commercial & Implementation Disclaimers
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-sm)", color: "var(--muted)" }}>
              {PRICING_DISCLAIMERS.map((disc, idx) => (
                <li key={idx} style={{ lineHeight: 1.55 }}>
                  {disc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>Detailed Plan Comparison</h2>
            <p>Compare specifications side-by-side to make the right decision for your retail floor.</p>
          </div>

          <div style={{ overflowX: "auto", background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "16px 20px", fontWeight: 700 }}>Feature / Capability</th>
                  <th style={{ padding: "16px 20px", fontWeight: 700 }}>Starter</th>
                  <th style={{ padding: "16px 20px", fontWeight: 700, color: "var(--accent)" }}>Growth (Most Popular)</th>
                  <th style={{ padding: "16px 20px", fontWeight: 700 }}>Departmental Premium</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Windows POS Counters</td>
                  <td style={{ padding: "14px 20px" }}>1 Counter</td>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Up to 5 Counters</td>
                  <td style={{ padding: "14px 20px" }}>25+ Counters</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Offline Durability (SQLite Outbox)</td>
                  <td style={{ padding: "14px 20px" }}>Included</td>
                  <td style={{ padding: "14px 20px" }}>Included</td>
                  <td style={{ padding: "14px 20px" }}>Included</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Item Catalog Limit</td>
                  <td style={{ padding: "14px 20px" }}>Up to 5,000 SKUs</td>
                  <td style={{ padding: "14px 20px" }}>Up to 50,000 SKUs</td>
                  <td style={{ padding: "14px 20px" }}>Unlimited</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Batch & FEFO Expiry Tracking</td>
                  <td style={{ padding: "14px 20px", color: "var(--muted)" }}>Basic</td>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Automated 7/30/60d Alerts</td>
                  <td style={{ padding: "14px 20px" }}>Advanced Multi-Warehouse</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Barcode Label Printing (ZPL / TSPL)</td>
                  <td style={{ padding: "14px 20px", color: "var(--muted)" }}>—</td>
                  <td style={{ padding: "14px 20px" }}>Included</td>
                  <td style={{ padding: "14px 20px" }}>Included</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Tamil Nadu GST Tax Engine</td>
                  <td style={{ padding: "14px 20px" }}>Standard (33)</td>
                  <td style={{ padding: "14px 20px" }}>Multi-Rate + HSN</td>
                  <td style={{ padding: "14px 20px" }}>Custom Tax Profiles</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Mobile Access Type</td>
                  <td style={{ padding: "14px 20px" }}>Responsive Web View</td>
                  <td style={{ padding: "14px 20px" }}>Planned Shared Platform App</td>
                  <td style={{ padding: "14px 20px" }}>Optional Dedicated White-Label</td>
                </tr>
                <tr>
                  <td style={{ padding: "14px 20px", fontWeight: 600 }}>Multi-Tenant Subdomain Activation</td>
                  <td style={{ padding: "14px 20px" }}>Post-review setup</td>
                  <td style={{ padding: "14px 20px" }}>Post-review setup</td>
                  <td style={{ padding: "14px 20px" }}>Custom Domain Available</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mkt-section alt" style={{ textAlign: "center" }}>
        <div className="mkt-container">
          <h2 style={{ fontSize: 28, margin: "0 0 12px" }}>Have Questions About Your Setup?</h2>
          <p style={{ color: "var(--muted)", maxWidth: 540, margin: "0 auto 24px" }}>
            We are happy to evaluate your current hardware, network setup, and product catalog to recommend the ideal plan.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
            <Link href="/request-demo" className="btn btn-primary" style={{ padding: "10px 24px" }}>
              Talk to Our Team
            </Link>
            <Link href="/register" className="btn btn-outline" style={{ padding: "10px 20px" }}>
              Submit Registration Request
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
