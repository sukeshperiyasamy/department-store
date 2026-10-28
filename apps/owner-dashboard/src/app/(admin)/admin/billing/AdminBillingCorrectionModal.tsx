"use client";

import React, { useState, useActionState } from "react";
import { X } from "lucide-react";
import { adminManualCorrectionAction, type BillingActionState } from "@/app/actions/billing";

interface Props {
  subscriptionId: string;
  currentStatus: string;
  businessName: string;
}

export function AdminBillingCorrectionModal({ subscriptionId, currentStatus, businessName }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<BillingActionState, FormData>(
    adminManualCorrectionAction,
    { success: false },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="btn btn-secondary"
        style={{ fontSize: 12, padding: "4px 8px" }}
      >
        Correct / Extend
      </button>

      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                Administrative Billing Correction
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close modal"
                style={{ background: "none", border: "none", display: "inline-flex", alignItems: "center", cursor: "pointer", color: "var(--muted)", padding: 4 }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--muted)" }}>
              Applying a correction to <strong>{businessName}</strong> (Sub: <code>{subscriptionId.slice(0, 8)}</code>).
              Current status: <strong>{currentStatus}</strong>.
            </p>

            <form
              action={async (fd) => {
                await formAction(fd);
              }}
            >
              <input type="hidden" name="subscription_id" value={subscriptionId} />

              {state.message && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    background: state.success ? "#ecfdf5" : "#fef2f2",
                    color: state.success ? "#065f46" : "#991b1b",
                    border: `1px solid ${state.success ? "#a7f3d0" : "#fecaca"}`,
                  }}
                >
                  {state.message}
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Target Subscription Status:
                </label>
                <select
                  name="target_status"
                  defaultValue={currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <option value="ACTIVE">ACTIVE (Restore & Reactivate Workspace)</option>
                  <option value="TRIALING">TRIALING</option>
                  <option value="PAST_DUE">PAST_DUE (Trigger Grace Period)</option>
                  <option value="SUSPENDED">SUSPENDED (Suspend Workspace Access)</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Extend Period (Days, Optional):
                </label>
                <input
                  type="number"
                  name="extend_days"
                  defaultValue={0}
                  min={0}
                  max={365}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                  Mandatory Audit Reason (min 5 chars): <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  rows={2}
                  placeholder="e.g., Manual bank transfer verified, approved 14-day promotional extension..."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: 13, padding: "8px 14px" }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn btn-primary"
                  style={{ fontSize: 13, padding: "8px 16px" }}
                >
                  {isPending ? "Applying..." : "Apply & Log Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
