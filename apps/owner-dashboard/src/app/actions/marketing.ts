"use server";

import {
  DemoRequestSchema,
  OnboardingRequestSchema,
  type DemoRequestResponse,
  type OnboardingRequestResponse,
} from "@departmental/shared-types";
import {
  checkSlugAvailability,
  submitDemoRequest,
  submitOnboardingRequest,
} from "@/lib/frappe-server";

export interface ActionState<T> {
  success: boolean;
  message?: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

export async function submitDemoAction(
  _prevState: ActionState<DemoRequestResponse> | null,
  formData: FormData,
): Promise<ActionState<DemoRequestResponse>> {
  const raw = {
    business_name: String(formData.get("business_name") ?? ""),
    contact_name: String(formData.get("contact_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    counter_count: Number(formData.get("counter_count") ?? 1),
    message: String(formData.get("message") ?? ""),
    consent_given: formData.get("consent_given") === "on" || formData.get("consent_given") === "true",
  };

  const parsed = DemoRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      success: false,
      message: "Please correct the highlighted form errors.",
      fieldErrors,
    };
  }

  try {
    const result = await submitDemoRequest(parsed.data);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to submit demo request. Please try again.",
    };
  }
}

export async function submitOnboardingAction(
  _prevState: ActionState<OnboardingRequestResponse> | null,
  formData: FormData,
): Promise<ActionState<OnboardingRequestResponse>> {
  const raw = {
    business_name: String(formData.get("business_name") ?? ""),
    owner_name: String(formData.get("owner_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    state: String(formData.get("state") ?? ""),
    city: String(formData.get("city") ?? ""),
    preferred_slug: String(formData.get("preferred_slug") ?? "").toLowerCase().trim(),
    requested_plan: String(formData.get("requested_plan") ?? "starter"),
    agreed_to_terms: formData.get("agreed_to_terms") === "on" || formData.get("agreed_to_terms") === "true",
  };

  const parsed = OnboardingRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      success: false,
      message: "Please correct the highlighted registration errors.",
      fieldErrors,
    };
  }

  // Pre-check slug availability
  const slugCheck = await checkSlugAvailability(parsed.data.preferred_slug);
  if (!slugCheck.available) {
    return {
      success: false,
      message: slugCheck.reason || `Subdomain '${parsed.data.preferred_slug}' is unavailable.`,
      fieldErrors: { preferred_slug: slugCheck.reason || "Subdomain is unavailable" },
    };
  }

  try {
    const result = await submitOnboardingRequest(parsed.data);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Registration request failed. Please try again.",
    };
  }
}

export async function checkSlugAction(slug: string): Promise<{ available: boolean; reason?: string }> {
  const res = await checkSlugAvailability(slug);
  return res.reason ? { available: res.available, reason: res.reason } : { available: res.available };
}
