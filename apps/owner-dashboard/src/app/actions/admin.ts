"use server";

import { revalidatePath } from "next/cache";
import {
  ApproveOnboardingPayloadSchema,
  RejectOnboardingPayloadSchema,
  RetryProvisioningPayloadSchema,
  SetTenantStatusPayloadSchema,
} from "@departmental/shared-types";
import {
  approvePlatformOnboarding,
  rejectPlatformOnboarding,
  retryPlatformProvisioning,
  setPlatformTenantStatus,
} from "@/lib/frappe-server";

export interface AdminActionState<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

export async function approveRequestAction(
  _prevState: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  const raw = {
    request_id: String(formData.get("request_id") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };

  const parsed = ApproveOnboardingPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid approval parameters",
    };
  }

  try {
    const res = await approvePlatformOnboarding(parsed.data.request_id, parsed.data.notes);
    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/operations");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to approve onboarding request.",
    };
  }
}

export async function rejectRequestAction(
  _prevState: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  const raw = {
    request_id: String(formData.get("request_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };

  const parsed = RejectOnboardingPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Rejection reason is required",
    };
  }

  try {
    const res = await rejectPlatformOnboarding(parsed.data.request_id, parsed.data.reason);
    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/operations");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to reject onboarding request.",
    };
  }
}

export async function retryJobAction(
  _prevState: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  const raw = {
    request_id: String(formData.get("request_id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };

  const parsed = RetryProvisioningPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid retry parameters",
    };
  }

  try {
    const res = await retryPlatformProvisioning(parsed.data.request_id, parsed.data.reason);
    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/operations");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to trigger retry.",
    };
  }
}

export async function setTenantStatusAction(
  _prevState: AdminActionState | null,
  formData: FormData,
): Promise<AdminActionState> {
  const raw = {
    tenant_id: String(formData.get("tenant_id") ?? ""),
    new_status: String(formData.get("new_status") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  };

  const parsed = SetTenantStatusPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Invalid tenant status parameters",
    };
  }

  try {
    const res = await setPlatformTenantStatus(parsed.data.tenant_id, parsed.data.new_status, parsed.data.reason);
    revalidatePath("/admin/onboarding");
    revalidatePath("/admin/operations");
    return {
      success: true,
      message: res.message,
      data: res,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update tenant status.",
    };
  }
}
