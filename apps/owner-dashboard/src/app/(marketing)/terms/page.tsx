import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Department Store ERP",
  description:
    "Terms of service governing subscription usage, Windows billing counter licenses, and Frappe ERPNext hosting.",
};

export default function TermsPage() {
  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div className="mkt-container" style={{ maxWidth: 840 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 10px", borderRadius: 4, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
            Draft Agreement
          </div>
          <h1 style={{ fontSize: 32, margin: "0 0 10px", color: "var(--text)" }}>
            Terms of Service & Commercial Usage Agreement
          </h1>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
            Last Updated: Phase 2 Pilot Release (October 2026) • Governed by Indian Commercial Law & Information Technology Framework
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "36px 32px", display: "flex", flexDirection: "column", gap: 24, fontSize: "var(--fs-md)", lineHeight: 1.65, color: "var(--text)" }}>
          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>1. Acceptance of Terms</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              By registering a store, requesting a demonstration, or downloading the Windows POS billing counter application, you agree to comply with and be bound by these Terms of Service. If you are registering on behalf of a retail business or partnership, you warrant that you have legal authority to bind that entity.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>2. Pilot Onboarding & Domain Reservation Policy</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Submitting an onboarding registration reserves your preferred subdomain (<span style={{ fontFamily: "monospace" }}>yourshop.departmentstore.in</span>) on a provisional basis. Live subdomain routing and tenant database provisioning require administrative verification of business credentials and GSTIN. Submission does not guarantee instant automated site provisioning.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>3. Dual-Tier Software Architecture & Responsibilities</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              The software consists of:
            </p>
            <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "var(--muted)" }}>
              <li><strong>Authoritative Cloud ERP:</strong> Frappe/ERPNext instances hosting stock valuation, purchase orders, chart of accounts, and official invoices.</li>
              <li><strong>Local Windows POS Counter:</strong> Native desktop application with local SQLite durability for high-throughput barcode scanning.</li>
            </ul>
            <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
              The merchant is responsible for maintaining Windows counter hardware, thermal receipt printers, barcode peripherals, and stable power/UPS supply.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>4. Offline Synchronization & Idempotency Rules</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              When a Windows counter operates in disconnected/offline mode, transactions are written atomically to the local SQLite outbox. Upon network resumption, the counter automatically synchronizes with the cloud. In the event of stock availability conflicts or price overrides occurring offline, transactions are flagged for Store Manager review in accordance with established ERP policy.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>5. GST & Regulatory Compliance</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              While the software provides pre-configured tax templates and HSN mappings for Tamil Nadu and All-India GST, the subscriber merchant remains solely responsible for the legal accuracy of tax returns, e-invoices, and statutory filings submitted to government authorities.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>6. Mobile Applications & Add-On Offerings</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Standard subscriptions include responsive mobile browser access to the Manager Console. Access to future shared mobile applications is subject to platform rollout schedules. Dedicated white-label mobile applications bearing the customer's custom branding require a separate commercial agreement, separate app store developer accounts, and an implementation fee.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>7. Governing Law & Dispute Resolution</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              These terms are governed by the laws of India. Any legal proceedings arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts in Tamil Nadu, India.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
