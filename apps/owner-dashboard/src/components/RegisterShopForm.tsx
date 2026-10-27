"use client";

import React, { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { submitOnboardingAction, checkSlugAction, type ActionState } from "@/app/actions/marketing";
import type { OnboardingRequestResponse } from "@departmental/shared-types";

export function RegisterShopForm({ initialPlan = "starter" }: { initialPlan?: string }) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState<OnboardingRequestResponse> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);

  // Slug availability checking state
  const [slug, setSlug] = useState("");
  const [slugCheck, setSlugCheck] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
  }>({ checking: false });

  // Debounced slug check
  useEffect(() => {
    const cleanSlug = slug.toLowerCase().trim();
    if (!cleanSlug) {
      setSlugCheck({ checking: false });
      return;
    }

    if (cleanSlug.length < 3) {
      setSlugCheck({
        checking: false,
        available: false,
        reason: "Slug must be at least 3 characters",
      });
      return;
    }

    setSlugCheck({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await checkSlugAction(cleanSlug);
        setSlugCheck(
          res.reason
            ? { checking: false, available: res.available, reason: res.reason }
            : { checking: false, available: res.available }
        );
      } catch {
        setSlugCheck({ checking: false, available: true });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitOnboardingAction(state, formData);
      setState(res);
    });
  };

  if (state?.success && state.data) {
    return (
      <div className="form-card" style={{ padding: "48px 36px", textAlign: "center" }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 32,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          ✓
        </div>

        <h2 style={{ fontSize: 26, margin: "0 0 12px", color: "var(--text)" }}>
          Onboarding Request Submitted
        </h2>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fef3c7", color: "#92400e", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, marginBottom: 20 }}>
          <span>● Status:</span>
          <span>{state.data.status} (Not Yet Live)</span>
        </div>

        <p style={{ color: "var(--muted)", fontSize: "var(--fs-md)", lineHeight: 1.6, maxWidth: 540, margin: "0 auto 24px" }}>
          Your shop registration request has been stored in our durable ledger. To prevent domain squatting and ensure valid GST setup, store subdomains are verified before live routing is provisioned.
        </p>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "20px 24px", textAlign: "left", maxWidth: 500, margin: "0 auto 28px", fontSize: "var(--fs-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 8 }}>
            <span style={{ color: "var(--muted)" }}>Reference ID:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{state.data.request_id}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 8 }}>
            <span style={{ color: "var(--muted)" }}>Requested Subdomain:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{state.data.preferred_slug}.departmentstore.in</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--muted)" }}>Next Step:</span>
            <span style={{ fontWeight: 600 }}>GSTIN & Store Owner Verification</span>
          </div>
        </div>

        <div style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", maxWidth: 500, margin: "0 auto 24px", lineHeight: 1.5 }}>
          Notice: No automated billing has been initiated and no live DNS records have been published. Our deployment team will contact you to configure your Frappe tenant site and Windows counters.
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
          <Link href="/" className="btn btn-primary" style={{ padding: "10px 22px" }}>
            Return to Homepage
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setState(null)}
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, margin: "0 0 6px", color: "var(--text)" }}>
          Register Your Store
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-sm)", margin: 0 }}>
          Reserve your preferred shop subdomain and initiate the Phase 2 onboarding verification process.
        </p>
      </div>

      {state?.message && !state.success && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "var(--error)", padding: "12px 16px", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: "var(--fs-sm)" }}>
          {state.message}
        </div>
      )}

      {/* Business & Owner Names */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="business_name">Shop / Store Legal Name *</label>
          <input
            id="business_name"
            name="business_name"
            type="text"
            placeholder="e.g. Annapoorna Supermarket"
            required
            aria-invalid={Boolean(state?.fieldErrors?.business_name)}
          />
          {state?.fieldErrors?.business_name && (
            <span className="field-error">{state.fieldErrors.business_name}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="owner_name">Authorized Owner / Manager Name *</label>
          <input
            id="owner_name"
            name="owner_name"
            type="text"
            placeholder="e.g. K. Sundaram"
            required
            aria-invalid={Boolean(state?.fieldErrors?.owner_name)}
          />
          {state?.fieldErrors?.owner_name && (
            <span className="field-error">{state.fieldErrors.owner_name}</span>
          )}
        </div>
      </div>

      {/* Email & Phone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="email">Official Contact Email *</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="owner@annapoorna.in"
            required
            aria-invalid={Boolean(state?.fieldErrors?.email)}
          />
          {state?.fieldErrors?.email && (
            <span className="field-error">{state.fieldErrors.email}</span>
          )}
          <span className="form-hint">Used for tenant activation and administrator account setup.</span>
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone / WhatsApp Number *</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+91 94432 12345"
            required
            aria-invalid={Boolean(state?.fieldErrors?.phone)}
          />
          {state?.fieldErrors?.phone && (
            <span className="field-error">{state.fieldErrors.phone}</span>
          )}
        </div>
      </div>

      {/* City & State */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="city">City / Town *</label>
          <input
            id="city"
            name="city"
            type="text"
            placeholder="e.g. Coimbatore"
            required
            aria-invalid={Boolean(state?.fieldErrors?.city)}
          />
          {state?.fieldErrors?.city && (
            <span className="field-error">{state.fieldErrors.city}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="state">State *</label>
          <input
            id="state"
            name="state"
            type="text"
            defaultValue="Tamil Nadu"
            required
            aria-invalid={Boolean(state?.fieldErrors?.state)}
          />
          {state?.fieldErrors?.state && (
            <span className="field-error">{state.fieldErrors.state}</span>
          )}
        </div>
      </div>

      {/* Preferred Slug with Live Availability Check */}
      <div className="form-group">
        <label htmlFor="preferred_slug">Preferred Shop Subdomain *</label>
        <div style={{ display: "flex", alignItems: "center" }}>
          <input
            id="preferred_slug"
            name="preferred_slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="annapoorna"
            style={{ borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)" }}
            required
            aria-invalid={Boolean(state?.fieldErrors?.preferred_slug || (slugCheck.available === false))}
          />
          <span
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderLeft: "none",
              padding: "10px 14px",
              borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
              color: "var(--muted)",
              fontSize: "var(--fs-sm)",
              whiteSpace: "nowrap",
            }}
          >
            .departmentstore.in
          </span>
        </div>

        {/* Live feedback */}
        {slugCheck.checking && (
          <span className="form-hint" style={{ color: "var(--accent)" }}>
            Checking subdomain availability...
          </span>
        )}
        {!slugCheck.checking && slug.length >= 3 && slugCheck.available === true && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--accent)", fontWeight: 600 }}>
            ✓ '{slug}.departmentstore.in' is available for reservation request.
          </span>
        )}
        {!slugCheck.checking && slugCheck.available === false && (
          <span className="field-error">
            ✗ {slugCheck.reason || "This subdomain is reserved or unavailable."}
          </span>
        )}
        {state?.fieldErrors?.preferred_slug && (
          <span className="field-error">{state.fieldErrors.preferred_slug}</span>
        )}
        <span className="form-hint">
          Must be 3–48 lowercase characters (letters, numbers, hyphens). Reserved system prefixes (e.g. app, api, admin) are blocked.
        </span>
      </div>

      {/* Requested Plan */}
      <div className="form-group">
        <label htmlFor="requested_plan">Requested Subscription Plan *</label>
        <select
          id="requested_plan"
          name="requested_plan"
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
        >
          <option value="starter">Starter Store (1 Counter, Up to 5,000 SKUs)</option>
          <option value="growth">Growth Multi-Counter (Up to 5 Counters, 50,000 SKUs) [Recommended]</option>
          <option value="enterprise">Departmental Premium (Custom Counters & Multi-Warehouse)</option>
        </select>
      </div>

      {/* Terms & Privacy Consent */}
      <div className="form-group" style={{ marginTop: 14 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontWeight: "normal" }}>
          <input
            type="checkbox"
            name="agreed_to_terms"
            value="true"
            style={{ width: "auto", marginTop: 4 }}
            required
          />
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", lineHeight: 1.5 }}>
            I agree to the <Link href="/terms" target="_blank" style={{ color: "var(--accent)", textDecoration: "underline" }}>Terms of Service</Link> and understand the <Link href="/privacy" target="_blank" style={{ color: "var(--accent)", textDecoration: "underline" }}>Privacy Notice</Link>. I understand that submitting this request reserves my preference pending GST verification and does not immediately provision a live subdomain.
          </span>
        </label>
        {state?.fieldErrors?.agreed_to_terms && (
          <span className="field-error">{state.fieldErrors.agreed_to_terms}</span>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: 16 }}
          disabled={isPending || slugCheck.available === false}
        >
          {isPending ? "Submitting Registration..." : "Submit Store Registration Request →"}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
        🔒 Safe Onboarding Guarantee: No sensitive passwords or credit card data collected. Requests require manual administrative verification.
      </div>
    </form>
  );
}
