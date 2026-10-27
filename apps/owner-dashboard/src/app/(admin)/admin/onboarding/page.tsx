import React from "react";
import { listPlatformOnboardingRequests } from "@/lib/frappe-server";
import { OnboardingAdminClient } from "@/components/OnboardingAdminClient";
import type { OnboardingDetailRecord } from "@departmental/shared-types";

export const metadata = {
  title: "Onboarding Requests — Platform Admin Console",
  description: "Review and approve departmental store onboarding requests and trigger site provisioning.",
};

export default async function OnboardingAdminPage() {
  let requests: OnboardingDetailRecord[] = [];
  let totalCount = 0;
  let authError: string | null = null;

  try {
    const res = await listPlatformOnboardingRequests("ALL", "", 1);
    requests = res.requests;
    totalCount = res.total;
  } catch (error) {
    authError = error instanceof Error ? error.message : "Failed to load onboarding requests";
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
          <strong>Permission Notice:</strong> SaaS control plane access requires the <code>Platform Admin</code> role on the central control site (<code>frontend</code>). System Managers on individual tenant store sites cannot inspect other tenants' onboarding records.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", margin: "0 0 6px" }}>
          Onboarding & Site Provisioning Console
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
          Review store registration requests, verify GST & business details, and trigger isolated Frappe site creation.
        </p>
      </div>

      <OnboardingAdminClient initialRequests={requests} totalCount={totalCount} />
    </div>
  );
}
