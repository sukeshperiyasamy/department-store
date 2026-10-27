import { Metadata } from "next";
import { OnboardingJourneyTracker } from "@/components/OnboardingJourneyTracker";
import { getOnboardingJourney } from "@/lib/frappe-server";
import type { CustomerOnboardingJourney } from "@departmental/shared-types";

export const metadata: Metadata = {
  title: "Onboarding Progress & Verification — Department Store ERP",
  description:
    "Track your retail store onboarding lifecycle, verify contact details, and follow site provisioning progress.",
};

export default async function OnboardingStatusPage({
  searchParams,
}: {
  searchParams?: Promise<{ request_id?: string; email?: string; token?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const requestId = resolvedParams.request_id || "";
  const email = resolvedParams.email || "";
  const token = resolvedParams.token || "";

  let initialJourney: CustomerOnboardingJourney | null = null;
  if (requestId) {
    try {
      const res = await getOnboardingJourney(requestId, email || undefined, token || undefined);
      if (res && res.journey) {
        initialJourney = res.journey;
      }
    } catch {
      // Handled inside OnboardingJourneyTracker with fallback verification input
    }
  }

  return (
    <div style={{ padding: "40px 0 80px" }}>
      <div className="mkt-container">
        <div className="mkt-section-head" style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "inline-block",
              background: "var(--accent-soft)",
              color: "var(--accent)",
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: "var(--fs-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Customer Onboarding Lifecycle
          </div>
          <h1 style={{ fontSize: 32, margin: "0 0 10px" }}>Store Onboarding & Activation Portal</h1>
          <p style={{ color: "var(--muted)", maxWidth: 640, margin: "0 auto" }}>
            Monitor your store setup across email verification, business review, Frappe site provisioning, and domain activation.
          </p>
        </div>

        <OnboardingJourneyTracker
          initialJourney={initialJourney}
          requestId={requestId}
          initialToken={token}
          initialEmail={email}
        />
      </div>
    </div>
  );
}
