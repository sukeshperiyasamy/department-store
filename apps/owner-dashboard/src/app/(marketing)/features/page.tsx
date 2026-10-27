import Link from "next/link";

export const metadata = {
  title: "Product Features — Department Store ERP",
  description:
    "Comprehensive overview of POS billing, catalog management, batch & expiry tracking, GST invoicing, and offline durability.",
};

export default function FeaturesPage() {
  return (
    <div>
      {/* Header */}
      <section className="mkt-hero" style={{ padding: "60px 0 40px" }}>
        <div className="mkt-container">
          <div className="mkt-hero-badge">
            <span>Modular Capability Matrix</span>
          </div>
          <h1 style={{ fontSize: 38 }}>
            Engineered for High-Throughput Retail Environments
          </h1>
          <p style={{ maxWidth: 760 }}>
            Every feature is designed specifically for departmental stores, supermarkets, and grocery retailers who require maximum checkout speed at the counter and rigorous accounting in the back office.
          </p>
        </div>
      </section>

      {/* Feature Section 1: POS Billing */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 36, alignItems: "center" }}>
            <div>
              <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "var(--fs-sm)", textTransform: "uppercase", marginBottom: 8 }}>
                Counter Billing Engine
              </div>
              <h2 style={{ fontSize: 28, color: "var(--text)", margin: "0 0 16px" }}>
                High-Speed Native POS Billing
              </h2>
              <p style={{ color: "var(--muted)", fontSize: "var(--fs-md)", lineHeight: 1.6, marginBottom: 20 }}>
                Cashiers can ring up customers at lightning speed with zero reliance on browser DOM rendering or continuous internet connection.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Keyboard-First Navigation:</strong> Dedicated function keys (F1-F12) for item search, discount application, quantity changes, and payment completion.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Instant Barcode Lookup:</strong> EAN-13, UPC, Code 128, and internal product code recognition in under 10 milliseconds.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Flexible Split Tender:</strong> Combine Cash, UPI (QR code display), and Card payments on a single invoice.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Customer Profiles & Credit:</strong> Quick customer lookup by mobile phone number with optional khata / store credit balance tracking.
                  </div>
                </div>
              </div>
            </div>

            <div className="mkt-card" style={{ background: "#ffffff", padding: 28, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13 }}>POS WORKFLOW METRICS</span>
                <span className="badge badge-success">Optimized</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span style={{ color: "var(--muted)" }}>Barcode scan to line item:</span>
                  <span style={{ fontWeight: 700 }}>&lt; 15 ms</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span style={{ color: "var(--muted)" }}>Receipt print generation:</span>
                  <span style={{ fontWeight: 700 }}>&lt; 50 ms</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span style={{ color: "var(--muted)" }}>Local SQLite persistence:</span>
                  <span style={{ fontWeight: 700 }}>Atomic synchronous commit</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Cash drawer kick:</span>
                  <span style={{ fontWeight: 700 }}>Hardware pulse trigger</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section 2: Catalog & Batch/Expiry */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 36, alignItems: "center" }}>
            <div className="mkt-card" style={{ background: "#ffffff", padding: 28, border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, color: "var(--accent)", fontSize: 13, marginBottom: 12 }}>
                STOCK & EXPIRY INTELLIGENCE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ background: "var(--surface)", padding: 10, borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>FEFO Batch Allocation</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Automatically prompts cashier with oldest non-expired batch.</div>
                </div>
                <div style={{ background: "var(--surface)", padding: 10, borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>Expiry Threshold Warnings</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Configurable 30d, 60d, 90d store alerts before product reaches sell-by date.</div>
                </div>
                <div style={{ background: "var(--surface)", padding: 10, borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)" }}>Audited Stock Adjustments</div>
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>Requires manager authorization, reason code, and physical tally logging.</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: "var(--fs-sm)", textTransform: "uppercase", marginBottom: 8 }}>
                Catalog & Inventory
              </div>
              <h2 style={{ fontSize: 28, color: "var(--text)", margin: "0 0 16px" }}>
                Strict Batch, Expiry & Inventory Tracking
              </h2>
              <p style={{ color: "var(--muted)", fontSize: "var(--fs-md)", lineHeight: 1.6, marginBottom: 20 }}>
                Supermarkets handle thousands of perishable items. Prevent expired stock from being sold and keep your inventory valuation accurate to the rupee.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Centralized Item Master:</strong> Manage 10,000+ SKUs with variants, brands, categories, and multiple units of measure (Piece, Kg, Gram, Pack).
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>MRP & Selling Price Controls:</strong> Support dual pricing (MRP vs Store Discounted Selling Price) with automatic price change sync.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>
                  <div>
                    <strong>Reorder Level Alerts:</strong> Automatic replenishment suggestions when items breach safety stock thresholds.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section 3: GST & Hardware */}
      <section className="mkt-section alt">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>GST Compliance & Peripheral Hardware</h2>
            <p>Ready for Indian tax authorities and store hardware ecosystems right out of the box.</p>
          </div>

          <div className="mkt-grid-3">
            <div className="mkt-card">
              <div className="mkt-card-icon">🏛️</div>
              <h3>Tamil Nadu & Indian GST</h3>
              <p>
                Native support for intra-state (CGST + SGST) and inter-state (IGST) split. 0%, 5%, 12%, 18%, 28% GST brackets with HSN/SAC code mapping and GSTR-1 preparation.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">🖨️</div>
              <h3>Thermal Printers</h3>
              <p>
                Direct ESC/POS driver-level printing for standard 3-inch (80mm) and 2-inch (58mm) thermal receipt printers (TVS, Epson, Citizen, Posiflex) with custom store headers.
              </p>
            </div>

            <div className="mkt-card">
              <div className="mkt-card-icon">⚖️</div>
              <h3>Electronic Weighing Scales</h3>
              <p>
                Integration with RS-232 serial and USB weighing scales for vegetable and grocery counters. Instant tare, gross weight, and computed line item pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section 4: Security, Roles & Transparency */}
      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head">
            <h2>Role Permissions & Operational Transparency</h2>
            <p>Ensure counter cashiers only access what they need while store owners retain complete oversight.</p>
          </div>

          <div className="mkt-grid-2">
            <div className="mkt-card">
              <h3 style={{ fontSize: 20 }}>Granular User Roles</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--fs-sm)" }}>
                <li><strong>Cashier:</strong> Fast billing, barcode scanning, split payment entry, receipt printing. Cannot alter historical stock or edit past bills.</li>
                <li><strong>Store Manager:</strong> Cash drawer opening float verification, price overrides, return/cancellation approvals, batch updates.</li>
                <li><strong>Store Owner / Administrator:</strong> Full access to financial ledgers, vendor purchase orders, employee access tokens, and store configuration.</li>
              </ul>
            </div>

            <div className="mkt-card">
              <h3 style={{ fontSize: 20 }}>Durable Offline Synchronization</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--fs-sm)" }}>
                <li><strong>Local SQLite Storage:</strong> Transactions and outbox queues are written synchronously to local disk before cashier receives confirmation.</li>
                <li><strong>Server-Side Idempotency:</strong> Re-transmitted payloads during network reconnections are matched by UUID to guarantee zero duplicate billing.</li>
                <li><strong>Safe Conflict Handling:</strong> Stock mismatches and offline pricing anomalies are placed in a manager review queue rather than silently discarded.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mkt-section" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", textAlign: "center" }}>
        <div className="mkt-container">
          <h2 style={{ fontSize: 28, margin: "0 0 12px" }}>Experience the Billing Speed Firsthand</h2>
          <p style={{ color: "var(--muted)", maxWidth: 560, margin: "0 auto 24px" }}>
            Book a 20-minute demonstration with our product engineers or register your store to start pilot onboarding.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
            <Link href="/request-demo" className="btn btn-primary" style={{ padding: "10px 24px" }}>
              Request Demo
            </Link>
            <Link href="/pricing" className="btn btn-outline" style={{ padding: "10px 20px" }}>
              View Plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
