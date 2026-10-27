"use client";

import React, { useActionState } from "react";
import { adminRetryWebhookAction, type BillingActionState } from "@/app/actions/billing";

interface Props {
  eventId: string;
  status: string;
}

export function AdminWebhookRetryButton({ eventId, status }: Props) {
  const [state, formAction, isPending] = useActionState<BillingActionState, FormData>(
    adminRetryWebhookAction,
    { success: false },
  );

  return (
    <form action={formAction} style={{ display: "inline-block" }}>
      <input type="hidden" name="event_id" value={eventId} />

      <button
        type="submit"
        disabled={isPending}
        className="btn btn-secondary"
        style={{
          fontSize: 11,
          padding: "3px 8px",
          color: status === "FAILED" ? "#991b1b" : "var(--teal-700)",
          borderColor: status === "FAILED" ? "#fecaca" : "var(--border)",
        }}
        title="Safely replay webhook event against reconciliation pipeline"
      >
        {isPending ? "Retrying..." : "Retry Event"}
      </button>

      {state.message && (
        <span style={{ fontSize: 11, marginLeft: 6, color: state.success ? "#065f46" : "#991b1b" }}>
          {state.success ? "✓ Retried" : "✕ Failed"}
        </span>
      )}
    </form>
  );
}
