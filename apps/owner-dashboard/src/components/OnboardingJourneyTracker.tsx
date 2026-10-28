"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Compass } from "lucide-react";
import type { CustomerOnboardingJourney } from "@departmental/shared-types";
import {
  verifyContactAction,
  resendVerificationAction,
  fetchOnboardingJourneyAction,
} from "@/app/actions/onboarding";

interface Props {
  initialJourney: CustomerOnboardingJourney | null;
  requestId: string;
  initialToken?: string;
  initialEmail?: string;
}

export function OnboardingJourneyTracker({
  initialJourney,
  requestId,
  initialToken = "",
  initialEmail = "",
}: Props) {
  const [journey, setJourney] = useState<CustomerOnboardingJourney | null>(initialJourney);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [emailInput, setEmailInput] = useState(initialEmail || initialJourney?.email || "");
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setActionMsg({ type: "error", text: "Please enter the verification token." });
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("request_id", requestId);
      fd.set("token", tokenInput.trim());
      const res = await verifyContactAction(null, fd);

      if (res.success) {
        setActionMsg({ type: "success", text: res.message || "Contact verified successfully!" });
        // Refresh journey
        const fresh = await fetchOnboardingJourneyAction(requestId, emailInput, tokenInput.trim());
        if (fresh.success && fresh.data) {
          setJourney(fresh.data.journey);
        }
      } else {
        setActionMsg({ type: "error", text: res.message || "Verification failed." });
      }
    });
  };

  const handleResend = () => {
    const targetEmail = emailInput || journey?.email;
    if (!targetEmail) {
      setActionMsg({ type: "error", text: "Please provide your email address to resend the verification link." });
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", targetEmail);
      const res = await resendVerificationAction(null, fd);
      if (res.success) {
        setActionMsg({
          type: "success",
          text: res.message || "A fresh verification link has been sent to your email address.",
        });
        if (res.data?.verification_token) {
          setTokenInput(res.data.verification_token);
        }
      } else {
        setActionMsg({ type: "error", text: res.message || "Failed to resend token." });
      }
    });
  };

  const handleRefresh = () => {
    startTransition(async () => {
      const fresh = await fetchOnboardingJourneyAction(
        requestId,
        emailInput || journey?.email,
        tokenInput.trim() || undefined,
      );
      if (fresh.success && fresh.data) {
        setJourney(fresh.data.journey);
        setActionMsg({ type: "success", text: "Onboarding status refreshed." });
      } else {
        setActionMsg({ type: "error", text: fresh.message || "Could not refresh onboarding status." });
      }
    });
  };

  if (!journey) {
    return (
      <div className="form-card" style={{ padding: "40px 32px", textAlign: "center" }}>
        <h2 style={{ fontSize: 22, color: "var(--text)", marginBottom: 12 }}>
          Onboarding Record Verification Required
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", maxWidth: 480, margin: "0 auto 24px" }}>
          To protect store security and privacy, enter the registered email address or verification token for Request ID:{" "}
          <strong style={{ fontFamily: "monospace", color: "var(--accent)" }}>{requestId}</strong>
        </p>

        {actionMsg && (
          <div
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              marginBottom: 20,
              fontSize: "var(--fs-sm)",
              background: actionMsg.type === "success" ? "var(--success-soft)" : "var(--error-soft)",
              color: actionMsg.type === "success" ? "var(--success)" : "var(--error)",
            }}
          >
            {actionMsg.text}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRefresh();
          }}
          style={{ maxWidth: 400, margin: "0 auto", textAlign: "left" }}
        >
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Registered Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="owner@yourshop.in"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Or Verification Token</label>
            <input
              type="text"
              className="form-input"
              placeholder="tok_..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={isPending}>
            {isPending ? "Validating Access..." : "View Onboarding Status"}
          </button>
        </form>
      </div>
    );
  }

  // Multi-dimensional Milestones
  const steps = [
    {
      title: "1. Shop Registration",
      status: "COMPLETED",
      description: "Business profile and subdomain reserved.",
      badge: "SUBMITTED",
      color: "var(--success)",
      bg: "var(--success-soft)",
    },
    {
      title: "2. Contact Verification",
      status: journey.contact_verification,
      description:
        journey.contact_verification === "VERIFIED"
          ? "Email ownership confirmed."
          : journey.contact_verification === "EXPIRED"
            ? "Verification token expired. Please resend."
            : "Check your email for the verification link.",
      badge: journey.contact_verification,
      color:
        journey.contact_verification === "VERIFIED"
          ? "var(--success)"
          : journey.contact_verification === "EXPIRED"
            ? "var(--error)"
            : "var(--warning)",
      bg:
        journey.contact_verification === "VERIFIED"
          ? "var(--success-soft)"
          : journey.contact_verification === "EXPIRED"
            ? "var(--error-soft)"
            : "var(--warning-soft)",
    },
    {
      title: "3. Business Review",
      status: journey.business_review,
      description:
        journey.business_review === "APPROVED"
          ? "Approved by platform operations."
          : journey.business_review === "REJECTED"
            ? "Registration rejected. Contact support."
            : "Platform team reviewing business parameters.",
      badge: journey.business_review,
      color:
        journey.business_review === "APPROVED"
          ? "var(--success)"
          : journey.business_review === "REJECTED"
            ? "var(--error)"
            : "var(--muted)",
      bg:
        journey.business_review === "APPROVED"
          ? "var(--success-soft)"
          : journey.business_review === "REJECTED"
            ? "var(--error-soft)"
            : "var(--surface)",
    },
    {
      title: "4. Frappe Site Provisioning",
      status: journey.provisioning,
      description:
        journey.provisioning === "PROVISIONED"
          ? `Dedicated site ${journey.assigned_site_name || "ready"}.`
          : journey.provisioning === "PROVISIONING_FAILED"
            ? "Provisioning encountered an error. Operator alert sent."
            : journey.provisioning === "RUNNING"
              ? "Running bench site creation and migrations..."
              : "Queued for automatic site creation.",
      badge: journey.provisioning,
      color:
        journey.provisioning === "PROVISIONED"
          ? "var(--success)"
          : journey.provisioning === "PROVISIONING_FAILED"
            ? "var(--error)"
            : "var(--muted)",
      bg:
        journey.provisioning === "PROVISIONED"
          ? "var(--success-soft)"
          : journey.provisioning === "PROVISIONING_FAILED"
            ? "var(--error-soft)"
            : "var(--surface)",
    },
    {
      title: "5. Hostname Verification",
      status: journey.hostname,
      description:
        journey.hostname === "VERIFIED"
          ? `Routing to ${journey.primary_hostname}.`
          : "Configuring wildcard DNS & TLS ingress.",
      badge: journey.hostname,
      color: journey.hostname === "VERIFIED" ? "var(--success)" : "var(--muted)",
      bg: journey.hostname === "VERIFIED" ? "var(--success-soft)" : "var(--surface)",
    },
    {
      title: "6. Subscription Status",
      status: journey.subscription,
      description: `Plan: ${journey.requested_plan.toUpperCase()} (${journey.subscription}).`,
      badge: journey.subscription,
      color:
        journey.subscription === "ACTIVE" || journey.subscription === "TRIALING"
          ? "var(--info)"
          : "var(--warning)",
      bg:
        journey.subscription === "ACTIVE" || journey.subscription === "TRIALING"
          ? "var(--info-soft)"
          : "var(--warning-soft)",
    },
    {
      title: "7. Store Access",
      status: journey.tenant_access,
      description:
        journey.tenant_access === "ACTIVE"
          ? "Store live and ready for billing operations."
          : "Access will unlock once review & provisioning complete.",
      badge: journey.tenant_access,
      color: journey.tenant_access === "ACTIVE" ? "var(--success)" : "var(--muted)",
      bg: journey.tenant_access === "ACTIVE" ? "var(--success-soft)" : "var(--surface)",
    },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Overview Card */}
      <div className="form-card" style={{ padding: "32px", marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-soft)", color: "var(--accent)", padding: "4px 12px", borderRadius: 999, fontSize: "var(--fs-xs)", fontWeight: 700, marginBottom: 8 }}>
              <span>REFERENCE:</span>
              <span style={{ fontFamily: "monospace" }}>{journey.request_id}</span>
            </div>
            <h1 style={{ fontSize: 24, margin: "0 0 6px", color: "var(--text)" }}>
              {journey.business_name}
            </h1>
            <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
              Owner: <strong>{journey.owner_name}</strong> • Subdomain:{" "}
              <strong style={{ color: "var(--accent)" }}>{journey.preferred_slug}.departmentstore.in</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleRefresh}
              disabled={isPending}
              style={{ fontSize: "var(--fs-sm)", padding: "6px 14px" }}
            >
              {isPending ? "Refreshing..." : "↻ Refresh Status"}
            </button>
          </div>
        </div>

        {/* Action Message Banner */}
        {actionMsg && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "var(--radius-sm)",
              margin: "20px 0 0",
              fontSize: "var(--fs-sm)",
              background: actionMsg.type === "success" ? "var(--success-soft)" : "var(--error-soft)",
              color: actionMsg.type === "success" ? "var(--success)" : "var(--error)",
              fontWeight: 500,
            }}
          >
            {actionMsg.text}
          </div>
        )}

        {/* Current Action Guidance */}
        <div
          style={{
            marginTop: 24,
            padding: "16px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <Compass size={24} color="var(--accent)" aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--fs-xs)", textTransform: "uppercase", fontWeight: 700, color: "var(--muted)" }}>
              Current Next Action
            </div>
            <div style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--text)", marginTop: 2 }}>
              {journey.next_action}
            </div>
          </div>
          {journey.tenant_access === "ACTIVE" && journey.primary_hostname && (
            <a
              href={`https://${journey.primary_hostname}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ padding: "8px 18px" }}
            >
              Launch Workspace →
            </a>
          )}
        </div>
      </div>

      {/* Contact Verification Action Card (Shown if unverified) */}
      {journey.contact_verification !== "VERIFIED" && (
        <div className="form-card" style={{ padding: "28px 32px", marginBottom: 24, borderLeft: "4px solid var(--warning)" }}>
          <h2 style={{ fontSize: 18, color: "var(--text)", margin: "0 0 8px" }}>
            Action Required: Verify Contact Email
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: "0 0 16px" }}>
            We sent a single-use verification link to <strong>{journey.email}</strong>. Enter the verification token below or click the link in your email to proceed.
          </p>

          <form onSubmit={handleVerify} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Paste verification token (tok_...)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{ flex: "1 1 280px" }}
            />
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? "Verifying..." : "Verify Token"}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleResend}
              disabled={isPending}
            >
              Resend Email
            </button>
          </form>
        </div>
      )}

      {/* Stepper Grid */}
      <div className="form-card" style={{ padding: "32px" }}>
        <h2 style={{ fontSize: 18, margin: "0 0 20px", color: "var(--text)" }}>
          Onboarding & Lifecycle Progression
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {steps.map((st, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "var(--fs-md)" }}>
                  {st.title}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", marginTop: 4 }}>
                  {st.description}
                </div>
              </div>

              <div
                style={{
                  background: st.bg,
                  color: st.color,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: "var(--fs-xs)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {st.badge}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
            Need operational help? Contact <strong>support@departmentstore.in</strong> with your Reference ID.
          </span>
          <Link href="/" className="btn btn-outline" style={{ fontSize: "var(--fs-xs)", padding: "6px 14px" }}>
            Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
