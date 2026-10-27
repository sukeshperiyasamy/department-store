import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  registerCustomerAction,
  verifyContactAction,
  resendVerificationAction,
  fetchOnboardingJourneyAction,
} from "./onboarding";
import * as frappeServer from "@/lib/frappe-server";

describe("Onboarding Server Actions (Phase 7)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerCustomerAction", () => {
    it("rejects when required fields are missing or invalid", async () => {
      const formData = new FormData();
      formData.set("business_name", "A"); // too short (< 2)
      formData.set("owner_name", "V");
      formData.set("email", "not-an-email");
      formData.set("phone", "123");
      formData.set("city", "");
      formData.set("state", "");
      formData.set("preferred_slug", "ab"); // too short (< 3)
      // agreed_to_terms missing

      const res = await registerCustomerAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.fieldErrors).toBeDefined();
      expect(res.fieldErrors?.business_name).toBeDefined();
      expect(res.fieldErrors?.email).toBeDefined();
      expect(res.fieldErrors?.preferred_slug).toBeDefined();
    });

    it("registers successfully with valid input and calls frappe-server", async () => {
      vi.spyOn(frappeServer, "registerCustomerOnboarding").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONBOARD-20261027-TEST1234",
        preferred_slug: "shree-balaji",
        status: "Under Verification",
        contact_verification: "PENDING",
        verification_token: "tok_mocked1234567890abcdef",
        message: "Registration submitted. Please check your email.",
      });

      const formData = new FormData();
      formData.set("business_name", "Shree Balaji Departmental");
      formData.set("owner_name", "S. Balaji");
      formData.set("email", "balaji@shreebalaji.in");
      formData.set("phone", "+91 98410 54321");
      formData.set("city", "Chennai");
      formData.set("state", "Tamil Nadu");
      formData.set("preferred_slug", "shree-balaji");
      formData.set("requested_plan", "starter");
      formData.set("agreed_to_terms", "true");

      const res = await registerCustomerAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data?.request_id).toBe("ONBOARD-20261027-TEST1234");
      expect(res.data?.contact_verification).toBe("PENDING");
      expect(res.data?.status).toBe("Under Verification");
    });

    it("handles server registration errors gracefully", async () => {
      vi.spyOn(frappeServer, "registerCustomerOnboarding").mockRejectedValueOnce(
        new Error("Too many registration requests. Please wait a few minutes."),
      );

      const formData = new FormData();
      formData.set("business_name", "Shree Balaji Departmental");
      formData.set("owner_name", "S. Balaji");
      formData.set("email", "balaji@shreebalaji.in");
      formData.set("phone", "+91 98410 54321");
      formData.set("city", "Chennai");
      formData.set("state", "Tamil Nadu");
      formData.set("preferred_slug", "shree-balaji");
      formData.set("requested_plan", "starter");
      formData.set("agreed_to_terms", "true");

      const res = await registerCustomerAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toContain("Too many registration requests");
    });
  });

  describe("verifyContactAction", () => {
    it("validates token and request_id presence", async () => {
      const formData = new FormData();
      formData.set("request_id", "");
      formData.set("token", "123"); // too short (< 6)

      const res = await verifyContactAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toBe("Invalid verification parameters.");
    });

    it("successfully verifies contact token", async () => {
      vi.spyOn(frappeServer, "verifyContactToken").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONBOARD-20261027-TEST1234",
        contact_verification: "VERIFIED",
        status: "Pending Review",
        message: "Email address verified successfully.",
      });

      const formData = new FormData();
      formData.set("request_id", "ONBOARD-20261027-TEST1234");
      formData.set("token", "tok_validsecrettoken12345");

      const res = await verifyContactAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data?.contact_verification).toBe("VERIFIED");
      expect(res.data?.status).toBe("Pending Review");
    });

    it("handles expired token error from server", async () => {
      vi.spyOn(frappeServer, "verifyContactToken").mockRejectedValueOnce(
        new Error("Verification token has expired. Please request a new verification email."),
      );

      const formData = new FormData();
      formData.set("request_id", "ONBOARD-20261027-TEST1234");
      formData.set("token", "tok_expiredtoken12345");

      const res = await verifyContactAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toContain("Verification token has expired");
    });
  });

  describe("resendVerificationAction", () => {
    it("rejects invalid email", async () => {
      const formData = new FormData();
      formData.set("email", "not-valid");

      const res = await resendVerificationAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toBe("A valid email address is required.");
    });

    it("resends verification token successfully", async () => {
      vi.spyOn(frappeServer, "resendVerificationToken").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONBOARD-20261027-TEST1234",
        verification_token: "tok_newresendtoken12345",
        message: "A fresh verification link has been sent to your email address.",
      });

      const formData = new FormData();
      formData.set("email", "owner@example.com");

      const res = await resendVerificationAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.message).toContain("fresh verification link");
    });
  });

  describe("fetchOnboardingJourneyAction", () => {
    it("rejects empty request ID", async () => {
      const res = await fetchOnboardingJourneyAction("");
      expect(res.success).toBe(false);
      expect(res.message).toContain("required");
    });

    it("fetches onboarding journey with dimensional statuses", async () => {
      vi.spyOn(frappeServer, "getOnboardingJourney").mockResolvedValueOnce({
        api_version: 1,
        journey: {
          request_id: "ONBOARD-20261027-TEST1234",
          business_name: "Test Store",
          owner_name: "Test Owner",
          email: "test@example.com",
          phone: "+91 99999 99999",
          preferred_slug: "test-store",
          requested_plan: "starter",
          assigned_site_name: "test-store.local",
          primary_hostname: "test-store.departmentstore.in",
          contact_verification: "VERIFIED",
          business_review: "APPROVED",
          provisioning: "PROVISIONED",
          hostname: "VERIFIED",
          subscription: "ACTIVE",
          tenant_access: "ACTIVE",
          next_action: "Your store workspace is ready!",
          can_resume: true,
          created_at: "2026-10-27T00:00:00Z",
          updated_at: "2026-10-27T01:00:00Z",
        },
      });

      const res = await fetchOnboardingJourneyAction(
        "ONBOARD-20261027-TEST1234",
        "test@example.com",
      );
      expect(res.success).toBe(true);
      expect(res.data?.journey.contact_verification).toBe("VERIFIED");
      expect(res.data?.journey.tenant_access).toBe("ACTIVE");
      expect(res.data?.journey.next_action).toContain("ready");
    });

    it("returns error message when unauthorized", async () => {
      vi.spyOn(frappeServer, "getOnboardingJourney").mockRejectedValueOnce(
        new Error("Access denied: You must provide the matching email address or verification token"),
      );

      const res = await fetchOnboardingJourneyAction(
        "ONBOARD-20261027-TEST1234",
        "wrong@example.com",
      );
      expect(res.success).toBe(false);
      expect(res.message).toContain("Access denied");
    });
  });
});
