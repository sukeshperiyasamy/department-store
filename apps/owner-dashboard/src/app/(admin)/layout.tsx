import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "SaaS Platform Control Plane — Department Store ERP",
  description: "Platform Administration, Onboarding Request Reviews, and Tenant Site Provisioning",
};

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get("ds_dash_sid"));
  const hasToken = Boolean(process.env.DASHBOARD_API_KEY && process.env.DASHBOARD_API_SECRET);

  if (!hasSession && !hasToken) {
    redirect("/login?next=/admin/onboarding");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Platform Control Plane Top Bar */}
      <header
        style={{
          background: "#042f2e", // Dark teal distinctly differentiating platform operator console
          color: "#ffffff",
          borderBottom: "1px solid #115e59",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ShieldCheck size={26} color="#2dd4bf" aria-hidden="true" />
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2dd4bf", fontWeight: 700 }}>
              SaaS Platform Control Plane
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#ffffff" }}>
              Department Store ERP Operator
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link
            href="/admin/operations"
            style={{
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              borderBottom: "2px solid #2dd4bf",
              paddingBottom: 4,
            }}
          >
            Operations Cockpit
          </Link>
          <Link
            href="/admin/onboarding"
            style={{
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              borderBottom: "2px solid #2dd4bf",
              paddingBottom: 4,
            }}
          >
            Onboarding Requests
          </Link>
          <Link
            href="/admin/billing"
            style={{
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              borderBottom: "2px solid #2dd4bf",
              paddingBottom: 4,
            }}
          >
            Subscriptions & Billing
          </Link>
          <Link
            href="/app"
            style={{
              color: "#99f6e4",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>Store Manager Console</span>
            <ExternalLink size={13} aria-hidden="true" />
          </Link>
          <Link
            href="/"
            style={{
              color: "#99f6e4",
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>Marketing Portal</span>
            <ExternalLink size={13} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        {children}
      </main>

      {/* Operator Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", background: "#ffffff", padding: "16px 24px", fontSize: 12, color: "var(--muted)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong>Permission Boundary:</strong> Platform Admin (Control Plane Site: <code>frontend</code>) • Tenant System Managers have zero control-plane access.
          </div>
          <div>
            Frappe multi-site isolation active • Independent database & encryption keys per tenant
          </div>
        </div>
      </footer>
    </div>
  );
}
