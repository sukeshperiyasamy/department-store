"use server";

import {
  setFeatureFlag,
  updateStoreProfile,
  submitSupportRequest,
} from "@/lib/frappe-server";
import {
  type FeatureFlagName,
  type StoreProfile,
  type SupportRequestPayload,
  type SupportRequestResult,
  type UpdateStoreProfilePayload,
  UpdateStoreProfilePayloadSchema,
  SupportRequestPayloadSchema,
} from "@departmental/shared-types";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  success: boolean;
  flag?: FeatureFlagName;
  value?: boolean;
  error?: string;
}

export interface ProfileActionResult {
  success: boolean;
  profile?: StoreProfile;
  error?: string;
}

export interface SupportActionResult {
  success: boolean;
  result?: SupportRequestResult;
  error?: string;
}

export async function toggleFlagAction(
  flag: FeatureFlagName,
  value: boolean,
): Promise<ActionResult> {
  try {
    const result = await setFeatureFlag(flag, value);
    revalidatePath("/settings");
    return { success: true, flag, value: result.value };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("403") ||
      message.includes("PermissionError") ||
      message.includes("authorization failed")
    ) {
      return {
        success: false,
        error:
          "Authorization failed: Store Manager or System Manager role is required to modify store settings.",
      };
    }
    return {
      success: false,
      error: `Failed to update ${flag}: ${message}`,
    };
  }
}

export async function updateStoreProfileAction(
  payload: UpdateStoreProfilePayload,
): Promise<ProfileActionResult> {
  try {
    const validated = UpdateStoreProfilePayloadSchema.parse(payload);
    const updated = await updateStoreProfile(validated);
    revalidatePath("/settings");
    return { success: true, profile: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("403") ||
      message.includes("PermissionError") ||
      message.includes("authorization failed")
    ) {
      return {
        success: false,
        error:
          "Authorization failed: Store Manager role is required to update store profile.",
      };
    }
    return {
      success: false,
      error: `Failed to update store profile: ${message}`,
    };
  }
}

export async function submitSupportRequestAction(
  payload: SupportRequestPayload,
): Promise<SupportActionResult> {
  try {
    const validated = SupportRequestPayloadSchema.parse(payload);
    const result = await submitSupportRequest(validated);
    return { success: true, result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to submit support request: ${message}`,
    };
  }
}
