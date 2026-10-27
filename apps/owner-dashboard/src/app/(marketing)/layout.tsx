import Link from "next/link";
import { cookies } from "next/headers";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);
  const isAuthenticated = hasSession || hasToken;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Top Header */}
      <header className="mkt-header">
        <nav className="mkt-nav" aria-label="Main Navigation">
          <Link href="/" className="mkt-brand">
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "var(--accent)",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              🏪
            </span>
            <span>Department Store ERP</span>
          </Link>

          <ul className="mkt-links">
            <li>
              <Link href="/features" className="mkt-link">
                Features
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="mkt-link">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/request-demo" className="mkt-link">
                Request Demo
              </Link>
            </li>
            <li>
              <Link href="/register" className="mkt-link">
                Register Shop
              </Link>
            </li>
          </ul>

          <div className="mkt-cta-group">
            {isAuthenticated ? (
              <Link href="/app" className="btn btn-primary" style={{ padding: "8px 16px" }}>
                Go to Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline" style={{ padding: "8px 14px" }}>
                  Sign In
                </Link>
                <Link href="/request-demo" className="btn btn-primary" style={{ padding: "8px 16px" }}>
                  Book Demo
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* Footer */}
      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-grid">
            <div className="mkt-footer-col">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 22 }}>🏪</span>
                <span style={{ fontWeight: 800, fontSize: "var(--fs-lg)", color: "var(--text)" }}>
                  Department Store ERP
                </span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", lineHeight: 1.6, maxWidth: 320 }}>
                Enterprise retail management built for Indian departmental stores and multi-counter supermarkets.
                Authoritative ERPNext cloud backend paired with durable offline-first Windows billing counters.
              </p>
              <div style={{ marginTop: 16, fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
                <span>Standard Architecture: Frappe / ERPNext + Windows Tauri POS + SQLite Cache</span>
              </div>
            </div>

            <div className="mkt-footer-col">
              <h4>Solutions</h4>
              <ul>
                <li><Link href="/features">Multi-Counter Billing</Link></li>
                <li><Link href="/features">Batch & Expiry Tracking</Link></li>
                <li><Link href="/features">Tamil Nadu GST Invoicing</Link></li>
                <li><Link href="/features">Durable Offline Queues</Link></li>
                <li><Link href="/features">Hardware Integrations</Link></li>
              </ul>
            </div>

            <div className="mkt-footer-col">
              <h4>Platform</h4>
              <ul>
                <li><Link href="/pricing">Subscription Plans</Link></li>
                <li><Link href="/request-demo">Schedule Store Demo</Link></li>
                <li><Link href="/register">Register Shop Entry</Link></li>
                <li><Link href="/login">Manager Console Login</Link></li>
                <li><a href="https://github.com/sukeshperiyasamy/department-store" target="_blank" rel="noreferrer">Open Source Core</a></li>
              </ul>
            </div>

            <div className="mkt-footer-col">
              <h4>Legal & Policy</h4>
              <ul>
                <li><Link href="/privacy">Privacy Policy</Link></li>
                <li><Link href="/terms">Terms of Service</Link></li>
                <li><span style={{ color: "var(--muted)", fontSize: "var(--fs-xs)" }}>Status: Phase 2 Pilot Foundation</span></li>
              </ul>
            </div>
          </div>

          <div className="mkt-footer-bottom">
            <div>
              © {new Date().getFullYear()} Department Store ERP. Designed for Indian Retail. All rights reserved.
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <span>Notices: Live subdomain routing & automated provisioning require verified onboarding.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
