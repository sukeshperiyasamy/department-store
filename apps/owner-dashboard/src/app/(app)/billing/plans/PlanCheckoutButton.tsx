"use client";

import React, { useActionState } from "react";
import { createCheckoutAction, type BillingActionState } from "@/app/actions/billing";

interface Props {
  tenantId: string;
  planId: string;
  planName: string;
}

export function PlanCheckoutButton({ tenantId, planId, planName }: Props) {
  const [state, formAction, isPending] = useActionState<BillingActionState, FormData>(
    createCheckoutAction,
    { success: false },
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="billing_interval" value="MONTHLY" />

      {state.message && (
        <div
          style={{
            marginBottom: 8,
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            background: state.success ? "#ecfdf5" : "#fef2f2",
            color: state.success ? "#065f46" : "#991b1b",
            border: `1px solid ${state.success ? "#a7f3d0" : "#fecaca"}`,
          }}
        >
          {state.message}
          {Boolean(state.data) && (
            <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11 }}>
              Order ID: {(state.data as any).order_id} (Sandbox Ready)
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn btn-primary"
        style={{
          width: "100%",
          padding: "10px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? "Creating Checkout..." : `Switch to ${planName}`}
      </button>
    </form>
  );
}
