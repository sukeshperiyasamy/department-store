import React from "react";
import { getPlatformOperationsOverview, listPlatformOnboardingRequests } from "@/lib/frappe-server";
import { OperationsDashboardClient } from "@/components/OperationsDashboardClient";
import type { PlatformOperationsOverview, OnboardingDetailRecord } from "@departmental/shared-types";

export const metadata = {
  title: "Platform Operations Cockpit — SaaS Control Plane",
  description: "Monitor customer onboarding queues, contact verification, site provisioning, and tenant lifecycle.",
};

export default async function OperationsDashboardPage() {
  let overview: PlatformOperationsOverview = {
    api_version: 1,
    total_registrations: 0,
    pending_verification: 0,
    pending_review: 0,
    active_provisioning: 0,
    failed_provisioning: 0,
    active_tenants: 0,
    suspended_tenants: 0,
    backup_status: {
      last_backup_at: "2026-10-27T03:56:10Z",
      status: "PASS",
      rehearsal_verified: true,
    },
  };

  let requests: OnboardingDetailRecord[] = [];
  let authError: string | null = null;

  try {
    const [overviewRes, requestsRes] = await Promise.all([
      getPlatformOperationsOverview(),
      listPlatformOnboardingRequests("ALL", "", 1),
    ]);
    overview = overviewRes;
    requests = requestsRes.requests;
  } catch (error) {
    authError = error instanceof Error ? error.message : "Failed to load platform operations overview";
  }

  if (authError) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", maxWidth: 600, margin: "40px auto" }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 22, margin: "0 0 10px", color: "var(--text)" }}>Platform Admin Access Required</h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          {authError}
        </p>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 14, fontSize: 12, textAlign: "left", color: "var(--muted)" }}>
          <strong>Permission Notice:</strong> Platform operations metrics require the <code>Platform Admin</code> role on the central control site. Ordinary tenant System Managers cannot inspect platform queues.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "inline-block", background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 10px", borderRadius: 4, fontSize: "var(--fs-xs)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
          Operations Cockpit
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", margin: "0 0 6px" }}>
          SaaS Operations & Tenant Lifecycle Management
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
          Central control plane for onboarding queues, email verification tracking, bench provisioning jobs, and tenant access.
        </p>
      </div>

      <OperationsDashboardClient initialOverview={overview} initialRequests={requests} />
    </div>
  );
}
