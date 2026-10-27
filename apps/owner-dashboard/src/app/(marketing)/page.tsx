import Link from "next/link";
import { SAAS_PLANS } from "@/lib/pricing";

export const metadata = {
  title: "Department Store ERP — Modern Retail & Windows POS for Indian Stores",
  description:
    "Authoritative ERPNext cloud backend with durable offline Windows billing counters for departmental stores and multi-counter retail.",
};

export default function MarketingHomePage() {
  return (
    <div>
      {/* 1 & 2. Hero Section */}
      <section className="mkt-hero">
        <div className="mkt-container">
          <div className="mkt-hero-badge">
            <span>⚡ Indian Retail Infrastructure</span>
            <span>•</span>
            <span>ERPNext + Windows POS + Local SQLite Queue</span>
          </div>

          <h1>
            Resilient Retail ERP & Billing Counters Built for Indian Department Stores
          </h1>

          <p>
            Eliminate checkout downtime. Run high-speed Windows billing counters that keep ringing up sales even when the internet drops, while your authoritative cloud ERP manages inventory, catalog, and GST compliance.
          </p>

          <div className="mkt-hero-actions">
            <Link href="/request-demo" className="btn btn-primary" style={{ padding: "12px 28px", fontSize: 16 }}>
              Request a Live Demo
            </Link>
            <Link href="/register" className="btn btn-outline" style={{ padding: "12px 24px", fontSize: 16 }}>
              Register Your Shop
            </Link>
            <Link href="/features" className="mkt-link" style={{ padding: "12px 16px", display: "inline-flex", alignItems: "center", gap: 6 }}>
              Explore Architecture →
            </Link>
          </div>

          <div style={{ marginTop: 24, fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
            ✓ Tamil Nadu & All-India GST Compliant &nbsp;|&nbsp; ✓ ESC/POS Thermal Printing &nbsp;|&nbsp; ✓ Durable Local Outbox Queues
          </div>
        </div>
      </section>

      {/* 3. Honest Product Preview (Truthful representations of Manager Console & POS Counter) */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 10px", borderRadius: 4, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
              Actual Architecture Preview
            </div>
            <h2>Unified Architecture: Cloud Console & Counter POS</h2>
            <p>
              A dual-tier system: ERPNext cloud services handle centralized inventory and accounting, while local Windows counters maintain customer checkouts without network latency.
            </p>
          </div>

          <div className="mkt-grid-2">
            {/* Component 1: Cloud Manager Console */}
            <div className="mkt-card" style={{ borderTop: "4px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>
                    Web Console (Next.js + Frappe)
                  </div>
                  <h3 style={{ margin: "4px 0 0" }}>Store Manager Console</h3>
                </div>
                <span className="badge badge-success">Cloud Authoritative</span>
              </div>
              <p style={{ marginBottom: 20 }}>
                Real-time dashboard for catalog management, stock replenishment, regional GST configuration, counter heartbeat monitoring, and financial reconciliation.
              </p>

              {/* UI Mockup matching actual apps/owner-dashboard */}
              <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, fontFamily: "monospace", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>● LIVE MONITOR</span>
                  <span style={{ color: "var(--muted)" }}>Counter 1: Active | Counter 2: Syncing</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "var(--surface)", padding: 8, borderRadius: 4 }}>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>TODAY'S SALES</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>₹ 1,48,250.00</div>
                  </div>
                  <div style={{ background: "var(--surface)", padding: 8, borderRadius: 4 }}>
                    <div style={{ color: "var(--muted)", fontSize: 10 }}>OUTBOX QUEUE</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>0 Pending</div>
                  </div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>
                  ✓ Batch Expiry Alerts: 3 items expiring &lt; 30d &nbsp;•&nbsp; GSTIN 33AAACG0000A1Z5 verified
                </div>
              </div>

              <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                * Truthful UI preview based on current Owner Dashboard implementation.
              </div>
            </div>

            {/* Component 2: Windows POS Counter */}
            <div className="mkt-card" style={{ borderTop: "4px solid #0284c7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "#0284c7", textTransform: "uppercase" }}>
                    Desktop Client (Tauri + React + SQLite)
                  </div>
                  <h3 style={{ margin: "4px 0 0" }}>Windows Billing Counter</h3>
                </div>
                <span className="badge badge-info">Durable Offline POS</span>
              </div>
              <p style={{ marginBottom: 20 }}>
                High-speed cashier POS designed for barcode scanners, thermal receipt printers, and instant customer checkout with persistent atomic SQLite draft storage.
              </p>

              {/* UI Mockup matching actual Windows POS */}
              <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 16, fontFamily: "monospace", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, color: "#0284c7" }}>BILL #POS-2026-0042</span>
                  <span style={{ color: "var(--muted)" }}>Barcode: 890103038472</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Aashirvaad Atta 5kg (B-204)</span>
                    <span>₹ 245.00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Tata Salt 1kg (x2)</span>
                    <span>₹ 56.00</span>
                  </div>
                </div>
                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>TOTAL (Incl. GST):</span>
                  <span style={{ color: "var(--accent)" }}>₹ 301.00</span>
                </div>
              </div>

              <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)", textAlign: "right" }}>
                * Counter bills commit locally to SQLite with idempotency UUID before server sync.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Features Overview */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>Built Specifically for Retail & Departmental Operations</h2>
            <p>
              Everything an Indian departmental store needs to balance rapid checkout lines with authoritative inventory control.
            </p>
          </div>

          <div className="mkt-grid-3">
            <div className="mkt-card">
              <div className="mkt-card-icon">⚡</div>
              <h3>Sub-Second Barcode POS</h3>
              <p>
                Optimized keyboard-first and barcode scanner workflows. Cashiers can ring up 30+ items a minute with automatic item search, batch selection, and discount calculation.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">💾</div>
              <h3>Offline-First Transaction Queue</h3>
              <p>
                Never lose a sale during internet outages. Local SQLite persists transactions and outbox events atomically. Retries happen automatically with server-side idempotency.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">📦</div>
              <h3>Batch & Expiry Management</h3>
              <p>
                Strict FEFO (First-Expired, First-Out) tracking. Prevent expired groceries and FMCG goods from reaching billing counters with automatic near-expiry alerts.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">🧾</div>
              <h3>GST Compliant Invoicing</h3>
              <p>
                Pre-configured for Tamil Nadu (State Code 33) and inter-state trade. Correct CGST, SGST, IGST calculations, HSN validation, and compliant tax invoice generation.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">🖨️</div>
              <h3>Hardware & Printer Support</h3>
              <p>
                Direct USB/Network ESC/POS thermal receipt printing (80mm & 58mm), cash drawer kick signals, digital weighing scale inputs, and barcode label generation.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">🔒</div>
              <h3>Multi-Counter Role Security</h3>
              <p>
                Role-based access control separating Cashier, Store Manager, and System Administrator privileges. Every manual discount, price override, and stock adjustment is logged.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Web Dashboard vs Windows POS Architectural Relationship */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>How the Architecture Works</h2>
            <p>
              Why dual-tier architecture protects your store from internet outages and data loss.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32 }}>
            <div style={{ background: "var(--card)", padding: 32, borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🖥️</span>
                <h3 style={{ margin: 0 }}>Windows POS Counters</h3>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, fontSize: "var(--fs-sm)", color: "var(--text)" }}>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Native Windows Client:</strong> Built with Rust (Tauri) and React for minimal memory footprint and zero browser latency.</span>
                </li>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Counter SQLite Cache:</strong> Caches price lists, active barcodes, and customers locally for instant response.</span>
                </li>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Atomic Outbox:</strong> Bills are signed with UUIDs and held in local durable storage until acknowledged by the cloud.</span>
                </li>
              </ul>
            </div>

            <div style={{ background: "var(--card)", padding: 32, borderRadius: "var(--radius-lg)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>☁️</span>
                <h3 style={{ margin: 0 }}>Authoritative ERPNext Cloud</h3>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, fontSize: "var(--fs-sm)", color: "var(--text)" }}>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Single Source of Truth:</strong> Stock valuation, accounting ledgers, purchase orders, and official invoices live in Frappe/ERPNext.</span>
                </li>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Server-Side Idempotency:</strong> Duplicate sync requests from flaky networks are safely de-duplicated without double-charging stock.</span>
                </li>
                <li style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <span><strong>Web Manager Console:</strong> Accessible anywhere on mobile or desktop browser for owner analytics and catalog updates.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Honest Mobile App Roadmap Section */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div style={{ background: "var(--accent-soft)", borderRadius: "var(--radius-lg)", padding: "36px 32px", border: "1px solid #99f6e4" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
              <div style={{ fontSize: 32 }}>📱</div>
              <div>
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", marginBottom: 4 }}>
                  Platform Roadmap Transparency
                </div>
                <h3 style={{ margin: "0 0 10px", color: "var(--text)" }}>
                  Mobile App Status: Shared Platform App in Planned Development
                </h3>
                <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "var(--fs-sm)", lineHeight: 1.6 }}>
                  To maintain transparency: the web Manager Console is fully responsive and usable on mobile browsers today. A shared Android/iOS mobile application for real-time owner notifications, stock audits, and sales summaries is currently in planned development. Dedicated customer-branded mobile applications with customized store logos and private app store releases are available as a premium add-on subject to implementation review.
                </p>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: "var(--fs-xs)", fontWeight: 600 }}>
                  <span style={{ color: "var(--accent)" }}>• Web Console: Available Now</span>
                  <span style={{ color: "var(--muted)" }}>• Shared Mobile App: Planned Platform Milestone</span>
                  <span style={{ color: "var(--muted)" }}>• Dedicated Branded App: Premium Offering</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Multi-Counter Store Benefits */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>Engineered for 1 to 5+ Billing Counters</h2>
            <p>
              Why supermarkets and grocery departmental stores choose our architecture over basic single-tablet POS apps.
            </p>
          </div>

          <div className="mkt-grid-3">
            <div className="mkt-card">
              <h3 style={{ fontSize: 18 }}>No Counter Lockouts</h3>
              <p>
                If Counter 1 is scanning groceries, Counter 2 can process a quick vegetable bill simultaneously without database lock contention.
              </p>
            </div>

            <div className="mkt-card">
              <h3 style={{ fontSize: 18 }}>Cash Drawer Reconciliation</h3>
              <p>
                Open and close shifts with verified opening float and physical cash tally. Automatically flag cashier cash discrepancies for store managers.
              </p>
            </div>

            <div className="mkt-card">
              <h3 style={{ fontSize: 18 }}>Split Payment Methods</h3>
              <p>
                Accept mixed payments per bill: Part Cash, Part UPI (PhonePe, GooglePay, Paytm QR), or Card with integrated transaction reference recording.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Pricing Preview */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>Straightforward, Transparent Plan Options</h2>
            <p>
              Choose a plan that fits your retail footprint. All prices are proposed and clearly documented for pilot onboarding.
            </p>
          </div>

          <div className="pricing-grid">
            {SAAS_PLANS.map((plan) => {
              const priceDisplay =
                plan.indicativePriceINR !== null
                  ? `₹ ${plan.indicativePriceINR.toLocaleString("en-IN")}`
                  : "Custom";

              return (
                <div key={plan.id} className={`pricing-card ${plan.isPopular ? "popular" : ""}`}>
                  {plan.isPopular && <div className="popular-badge">Most Popular</div>}
                  <div>
                    <h3 style={{ fontSize: "var(--fs-xl)", margin: "0 0 6px" }}>{plan.name}</h3>
                    <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
                      {plan.tagline}
                    </p>

                    <div className="plan-price">
                      <span className="plan-amount">{priceDisplay}</span>
                      {plan.indicativePriceINR !== null && (
                        <span className="plan-freq">/ month (indicative)</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
                      {plan.billingFrequency}
                    </div>

                    <ul className="plan-features">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="plan-feature-item">
                          <span className="plan-feature-check">✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <Link
                      href={`/register?plan=${plan.id}`}
                      className={`btn ${plan.isPopular ? "btn-primary" : "btn-outline"}`}
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      Select {plan.name}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <Link href="/pricing" className="mkt-link" style={{ fontWeight: 700 }}>
              View Complete Feature Matrix & Commercial Disclaimers →
            </Link>
          </div>
        </div>
      </section>

      {/* 9. FAQ Section */}
      <section className="mkt-section alt">
        <div className="mkt-container" style={{ maxWidth: 840 }}>
          <div className="mkt-section-head">
            <h2>Frequently Asked Questions</h2>
            <p>Common questions about our architecture, offline behavior, and onboarding process.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="mkt-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>
                What happens when the shop's internet connection fails during billing?
              </h3>
              <p>
                Billing continues uninterrupted. The Windows POS counter operates on its local SQLite cache of products, barcodes, and prices. Invoices are stored in a durable local outbox and automatically synchronized to the central ERP as soon as connectivity resumes.
              </p>
            </div>

            <div className="mkt-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>
                How does multi-counter billing prevent duplicate bill numbers offline?
              </h3>
              <p>
                Each billing counter uses a unique counter prefix and local atomic sequence generator with UUID transaction IDs. When synced to central ERPNext, transactions are reconciled idempotently without collision or double-posting.
              </p>
            </div>

            <div className="mkt-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>
                Is this GST compliant for Tamil Nadu and inter-state trade?
              </h3>
              <p>
                Yes. The ERP backend enforces standard GST rules with proper state code resolution (Tamil Nadu State Code 33), CGST/SGST splitting for intra-state sales, IGST for inter-state transactions, and HSN-level tax rates.
              </p>
            </div>

            <div className="mkt-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>
                What hardware is required at the checkout counter?
              </h3>
              <p>
                Any standard PC running Windows 10 or 11 with 4GB+ RAM, any standard USB or wireless barcode scanner, and an ESC/POS 80mm or 58mm thermal receipt printer. Digital weighing scales with serial/USB output are also supported.
              </p>
            </div>

            <div className="mkt-card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>
                When will my shop subdomain become active after registration?
              </h3>
              <p>
                During Phase 2 pilot onboarding, registrations create a durable onboarding record pending manual review and verification. Once your store details and GSTIN are verified by our team, your dedicated tenant domain is provisioned.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 10. Demo / Contact CTA Section */}
      <section className="mkt-section" style={{ background: "var(--accent)", color: "#ffffff", textAlign: "center" }}>
        <div className="mkt-container">
          <h2 style={{ fontSize: 36, color: "#ffffff", margin: "0 0 16px" }}>
            Ready to upgrade your store's billing & inventory?
          </h2>
          <p style={{ color: "#ccfbf1", fontSize: "var(--fs-lg)", maxWidth: 640, margin: "0 auto 32px" }}>
            Experience the speed of native Windows billing with the power of cloud-backed ERPNext management. Schedule a tailored walkthrough today.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
            <Link
              href="/request-demo"
              className="btn"
              style={{ background: "#ffffff", color: "var(--accent)", fontWeight: 700, padding: "12px 28px", fontSize: 16 }}
            >
              Book a Store Demo
            </Link>
            <Link
              href="/register"
              className="btn btn-outline"
              style={{ borderColor: "#ffffff", color: "#ffffff", padding: "12px 24px", fontSize: 16 }}
            >
              Register New Shop
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
