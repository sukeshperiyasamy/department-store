"use server";

import { setFeatureFlag } from "@/lib/frappe-server";
import { type FeatureFlagName } from "@departmental/shared-types";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  success: boolean;
  flag?: FeatureFlagName;
  value?: boolean;
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
          "Authorization failed: System Manager role is required to modify store settings. Cashiers and reporting service accounts cannot change configuration.",
      };
    }
    return {
      success: false,
      error: `Failed to update ${flag}: ${message}`,
    };
  }
}
