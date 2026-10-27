"use client";

import React, { useState, useActionState } from "react";
import Link from "next/link";
import { cancelSubscriptionAction, type BillingActionState } from "@/app/actions/billing";

interface Props {
  tenantId: string;
  currentPeriodEnd: string;
}

export function CancelSubscriptionForm({ tenantId, currentPeriodEnd }: Props) {
  const [state, formAction, isPending] = useActionState<BillingActionState, FormData>(
    cancelSubscriptionAction,
    { success: false },
  );

  const [cancelType, setCancelType] = useState<"scheduled" | "immediate">("scheduled");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form action={formAction}>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="immediate" value={cancelType === "immediate" ? "true" : "false"} />

      {state.message && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 13,
            background: state.success ? "#ecfdf5" : "#fef2f2",
            color: state.success ? "#065f46" : "#991b1b",
            border: `1px solid ${state.success ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {state.message}
          {state.success && (
            <div style={{ marginTop: 8 }}>
              <Link href="/billing" style={{ color: "var(--teal-700)", fontWeight: 700 }}>
                ← Return to Billing Overview
              </Link>
            </div>
          )}
        </div>
      )}

      {!state.success && (
        <>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>
              Cancellation Timing:
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px",
                  border: cancelType === "scheduled" ? "2px solid var(--teal-600)" : "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: cancelType === "scheduled" ? "#f0fdf4" : "#ffffff",
                }}
              >
                <input
                  type="radio"
                  name="timing_option"
                  checked={cancelType === "scheduled"}
                  onChange={() => setCancelType("scheduled")}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Cancel at end of billing cycle (Recommended)</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Maintain full access until <strong>{currentPeriodEnd}</strong>. No further renewal charges will be made.
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px",
                  border: cancelType === "immediate" ? "2px solid #ef4444" : "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: cancelType === "immediate" ? "#fef2f2" : "#ffffff",
                }}
              >
                <input
                  type="radio"
                  name="timing_option"
                  checked={cancelType === "immediate"}
                  onChange={() => setCancelType("immediate")}
                  style={{ marginTop: 3 }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#991b1b" }}>Immediate Cancellation</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Immediately suspends active POS counters and dashboard login. Store database archived for 90 days.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="reason" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
              Reason for Cancellation <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              id="reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Please let us know why you are cancelling (e.g., store closure, seasonality, hardware change)..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>I understand my store workspace and counters will follow this cancellation schedule.</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="submit"
              disabled={isPending || !confirmed}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: confirmed ? "#dc2626" : "#cbd5e1",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 700,
                cursor: confirmed && !isPending ? "pointer" : "not-allowed",
              }}
            >
              {isPending ? "Processing..." : "Confirm Cancellation"}
            </button>
            <Link
              href="/billing"
              className="btn btn-secondary"
              style={{ textDecoration: "none", padding: "10px 18px", fontSize: 13 }}
            >
              Never mind, keep active
            </Link>
          </div>
        </>
      )}
    </form>
  );
}
