"use server";

import {
  OnboardingRequestSchema,
  VerifyContactPayloadSchema,
  ResendVerificationPayloadSchema,
  type CustomerOnboardingStatusResponse,
} from "@departmental/shared-types";
import {
  registerCustomerOnboarding,
  verifyContactToken,
  resendVerificationToken,
  getOnboardingJourney,
} from "@/lib/frappe-server";

export interface ActionState<T> {
  success: boolean;
  message?: string;
  data?: T;
  fieldErrors?: Record<string, string>;
}

export async function registerCustomerAction(
  _prevState: ActionState<any> | null,
  formData: FormData,
): Promise<ActionState<any>> {
  const raw = {
    business_name: String(formData.get("business_name") ?? "").trim(),
    owner_name: String(formData.get("owner_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    preferred_slug: String(formData.get("preferred_slug") ?? "").toLowerCase().trim(),
    requested_plan: String(formData.get("requested_plan") ?? "starter").toLowerCase().trim(),
    agreed_to_terms:
      formData.get("agreed_to_terms") === "on" ||
      formData.get("agreed_to_terms") === "true",
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
      message: "Please correct the highlighted form errors.",
      fieldErrors,
    };
  }

  try {
    const result = await registerCustomerOnboarding({
      ...parsed.data,
      requested_plan: raw.requested_plan,
    });
    return {
      success: true,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to register shop. Please try again.",
    };
  }
}

export async function verifyContactAction(
  _prevState: ActionState<any> | null,
  formData: FormData,
): Promise<ActionState<any>> {
  const raw = {
    request_id: String(formData.get("request_id") ?? "").trim(),
    token: String(formData.get("token") ?? "").trim(),
  };

  const parsed = VerifyContactPayloadSchema.safeParse(raw);
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
      message: "Invalid verification parameters.",
      fieldErrors,
    };
  }

  try {
    const result = await verifyContactToken(parsed.data.request_id, parsed.data.token);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Contact verification failed.",
    };
  }
}

export async function resendVerificationAction(
  _prevState: ActionState<any> | null,
  formData: FormData,
): Promise<ActionState<any>> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
  };

  const parsed = ResendVerificationPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      message: "A valid email address is required.",
    };
  }

  try {
    const result = await resendVerificationToken(parsed.data.email);
    return {
      success: true,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to resend verification link.",
    };
  }
}

export async function fetchOnboardingJourneyAction(
  requestId: string,
  email?: string,
  token?: string,
): Promise<ActionState<CustomerOnboardingStatusResponse>> {
  if (!requestId || !requestId.trim()) {
    return {
      success: false,
      message: "Onboarding request ID is required.",
    };
  }

  try {
    const response = await getOnboardingJourney(requestId.trim(), email?.trim(), token?.trim());
    return {
      success: true,
      data: response,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to retrieve onboarding journey.",
    };
  }
}
