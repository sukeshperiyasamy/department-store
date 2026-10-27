"use client";

import React, { useState, useTransition } from "react";
import { submitDemoAction, type ActionState } from "@/app/actions/marketing";
import type { DemoRequestResponse } from "@departmental/shared-types";

export function DemoRequestForm() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState<DemoRequestResponse> | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitDemoAction(state, formData);
      setState(res);
    });
  };

  if (state?.success && state.data) {
    return (
      <div className="form-card" style={{ textAlign: "center", padding: "48px 32px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          ✓
        </div>
        <h2 style={{ fontSize: 24, margin: "0 0 12px", color: "var(--text)" }}>
          Demo Request Confirmed
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "var(--fs-md)", lineHeight: 1.6, maxWidth: 480, margin: "0 auto 20px" }}>
          Thank you! We have received your request. Our product engineering team will contact you within 1 business day to schedule your interactive counter demonstration.
        </p>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 20px", display: "inline-block", textAlign: "left", marginBottom: 28, fontSize: "var(--fs-sm)" }}>
          <div><strong>Request Reference:</strong> <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>{state.data.request_id}</span></div>
          <div style={{ marginTop: 4 }}><strong>Status:</strong> {state.data.status}</div>
          <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>A copy of your lead has been safely recorded in the central platform ledger.</div>
        </div>

        <div>
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
      {state?.message && !state.success && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "var(--error)", padding: "12px 16px", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: "var(--fs-sm)" }}>
          {state.message}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="business_name">Shop / Business Name *</label>
          <input
            id="business_name"
            name="business_name"
            type="text"
            placeholder="e.g. Sri Murugan Departmental Stores"
            required
            aria-invalid={Boolean(state?.fieldErrors?.business_name)}
          />
          {state?.fieldErrors?.business_name && (
            <span className="field-error">{state.fieldErrors.business_name}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="contact_name">Contact Person's Name *</label>
          <input
            id="contact_name"
            name="contact_name"
            type="text"
            placeholder="e.g. S. Ramanathan"
            required
            aria-invalid={Boolean(state?.fieldErrors?.contact_name)}
          />
          {state?.fieldErrors?.contact_name && (
            <span className="field-error">{state.fieldErrors.contact_name}</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="email">Email Address *</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="ramanathan@store.in"
            required
            aria-invalid={Boolean(state?.fieldErrors?.email)}
          />
          {state?.fieldErrors?.email && (
            <span className="field-error">{state.fieldErrors.email}</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="phone">Phone / WhatsApp Number *</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+91 98400 12345"
            required
            aria-invalid={Boolean(state?.fieldErrors?.phone)}
          />
          {state?.fieldErrors?.phone && (
            <span className="field-error">{state.fieldErrors.phone}</span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="form-group">
          <label htmlFor="city">City *</label>
          <input
            id="city"
            name="city"
            type="text"
            placeholder="e.g. Madurai"
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

        <div className="form-group">
          <label htmlFor="counter_count">Billing Counters *</label>
          <select id="counter_count" name="counter_count" defaultValue={2}>
            <option value={1}>1 Counter</option>
            <option value={2}>2 Counters</option>
            <option value={3}>3 Counters</option>
            <option value={4}>4 Counters</option>
            <option value={5}>5 Counters</option>
            <option value={8}>6–10 Counters</option>
            <option value={15}>10+ Counters</option>
          </select>
          {state?.fieldErrors?.counter_count && (
            <span className="field-error">{state.fieldErrors.counter_count}</span>
          )}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="message">Questions or Specific Store Needs (Optional)</label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Tell us about your current billing setup, barcode scanners, or thermal printers..."
        />
        {state?.fieldErrors?.message && (
          <span className="field-error">{state.fieldErrors.message}</span>
        )}
      </div>

      <div className="form-group" style={{ marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontWeight: "normal" }}>
          <input
            type="checkbox"
            name="consent_given"
            value="true"
            defaultChecked
            style={{ width: "auto", marginTop: 4 }}
            required
          />
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--muted)", lineHeight: 1.5 }}>
            I consent to Department Store ERP contacting me via phone, WhatsApp, or email regarding this demo request and store onboarding evaluation.
          </span>
        </label>
        {state?.fieldErrors?.consent_given && (
          <span className="field-error">{state.fieldErrors.consent_given}</span>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: 16 }}
          disabled={isPending}
        >
          {isPending ? "Submitting Request..." : "Schedule Live Product Demo →"}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: "var(--fs-xs)", color: "var(--muted)" }}>
        🔒 Your contact information is never shared or sold. Recorded securely for direct engineering follow-up.
      </div>
    </form>
  );
}
