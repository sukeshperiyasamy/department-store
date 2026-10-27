import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Department Store ERP",
  description:
    "Privacy and data protection policy for Department Store ERP subscribers, billing counters, and consumer data.",
};

export default function PrivacyPage() {
  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div className="mkt-container" style={{ maxWidth: 840 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 10px", borderRadius: 4, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
            Draft Notice
          </div>
          <h1 style={{ fontSize: 32, margin: "0 0 10px", color: "var(--text)" }}>
            Privacy Policy & Data Processing Notice
          </h1>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
            Last Updated: Phase 2 Pilot Release (October 2026) • Governed by Indian Information Technology Act & Digital Personal Data Protection Act guidelines
          </div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "36px 32px", display: "flex", flexDirection: "column", gap: 24, fontSize: "var(--fs-md)", lineHeight: 1.65, color: "var(--text)" }}>
          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>1. Scope & Commitment</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Department Store ERP ("we", "us", "our") provides multi-counter point-of-sale software and enterprise resource planning services for retail merchants in India. This privacy notice explains how we collect, store, and process lead information, merchant account data, and transactional information synchronized between Windows POS counters and authoritative Frappe/ERPNext backends.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>2. Information Collected During Onboarding</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              When you submit a demo request or register a store, we collect:
            </p>
            <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "var(--muted)" }}>
              <li>Merchant business name and registered store legal entity</li>
              <li>Authorized contact person's name, email address, and phone number</li>
              <li>Store geographical location (City, State / Tamil Nadu GST jurisdiction)</li>
              <li>Hardware footprint details (estimated billing counters, thermal printer models)</li>
            </ul>
            <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
              We do not collect plaintext passwords, payment card numbers, or bank account credentials on public marketing forms.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>3. Merchant Customer Data (Data Processor Role)</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              When cashiers ring up retail transactions, customer phone numbers and bill items may be recorded for GST compliance, receipt generation, or loyalty credit.
            </p>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 16, borderRadius: 6, marginTop: 10, fontSize: "var(--fs-sm)" }}>
              <strong>Merchant Ownership Principle:</strong> All retail consumer records belong exclusively to the subscriber merchant. Department Store ERP acts strictly as a data processor. We do not sell, aggregate, advertise to, or monetize your end customers' purchase habits.
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>4. Local Windows Counter Storage & Sync Durability</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Windows billing counters store catalog snapshots, price lists, and pending transaction outboxes in an encrypted or local SQLite database on merchant premises. Synchronization payloads transmitted over the network use TLS 1.3 encryption and server-side idempotency verification.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>5. Security Practices & Role Isolation</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              Access to merchant tenant environments is enforced on the server. Platform support personnel do not access merchant accounting ledgers or customer databases without explicit authorization and audit logging.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: 20, margin: "0 0 10px", color: "var(--text)" }}>6. Inquiries & Corrections</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              For questions regarding privacy, lead data removal, or pilot verification, please contact us at <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>privacy@departmentstore.in</span> or through the <Link href="/request-demo" style={{ color: "var(--accent)" }}>demo request form</Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
