"use server";

import { revalidatePath } from "next/cache";
import {
  CreateCheckoutSessionPayloadSchema,
  CancelSubscriptionPayloadSchema,
  ManualBillingCorrectionPayloadSchema,
} from "@departmental/shared-types";
import {
  createCheckoutSession,
  cancelSubscription,
  adminManualBillingCorrection,
  adminRetryWebhookEvent,
} from "@/lib/frappe-server";

export interface BillingActionState<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

export async function createCheckoutAction(
  _prevState: BillingActionState | null,
  formData: FormData,
): Promise<BillingActionState> {
  const raw = {
    tenant_id: String(formData.get("tenant_id") ?? ""),
    plan_id: String(formData.get("plan_id") ?? ""),
    billing_interval: String(formData.get("billing_interval") ?? "MONTHLY"),
  };

  const parsed = CreateCheckoutSessionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid checkout parameters",
    };
  }

  try {
    const res = await createCheckoutSession(
      parsed.data.tenant_id,
      parsed.data.plan_id,
      parsed.data.billing_interval,
    );
    revalidatePath("/app/billing");
    return {
      success: true,
      message: "Checkout session created successfully (Sandbox mode)",
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to initiate checkout session.",
    };
  }
}

export async function cancelSubscriptionAction(
  _prevState: BillingActionState | null,
  formData: FormData,
): Promise<BillingActionState> {
  const raw = {
    tenant_id: String(formData.get("tenant_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    immediate: formData.get("immediate") === "true",
  };

  const parsed = CancelSubscriptionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Cancellation reason is required",
    };
  }

  try {
    const res = await cancelSubscription(
      parsed.data.tenant_id,
      parsed.data.reason,
      parsed.data.immediate,
    );
    revalidatePath("/app/billing");
    revalidatePath("/app/billing/cancel");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to cancel subscription.",
    };
  }
}

export async function adminManualCorrectionAction(
  _prevState: BillingActionState | null,
  formData: FormData,
): Promise<BillingActionState> {
  const raw = {
    subscription_id: String(formData.get("subscription_id") ?? ""),
    target_status: String(formData.get("target_status") ?? ""),
    extend_days: Number(formData.get("extend_days") ?? 0),
    reason: String(formData.get("reason") ?? ""),
  };

  const parsed = ManualBillingCorrectionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "A valid administrative reason (min 5 chars) is required",
    };
  }

  try {
    const res = await adminManualBillingCorrection(
      parsed.data.subscription_id,
      parsed.data.target_status,
      parsed.data.reason,
      parsed.data.extend_days ?? 0,
    );
    revalidatePath("/admin/billing");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to apply manual billing correction.",
    };
  }
}

export async function adminRetryWebhookAction(
  _prevState: BillingActionState | null,
  formData: FormData,
): Promise<BillingActionState> {
  const eventId = String(formData.get("event_id") ?? "");
  if (!eventId) {
    return {
      success: false,
      message: "Event ID is required",
    };
  }

  try {
    const res = await adminRetryWebhookEvent(eventId);
    revalidatePath("/admin/billing");
    return {
      success: true,
      message: `Successfully retried webhook event ${eventId}`,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to retry webhook event.",
    };
  }
}
