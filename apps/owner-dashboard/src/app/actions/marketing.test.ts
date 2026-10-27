import { describe, expect, it, vi, beforeEach } from "vitest";
import { submitDemoAction, submitOnboardingAction, checkSlugAction } from "./marketing";
import * as frappeServer from "@/lib/frappe-server";

describe("Marketing Server Actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("submitDemoAction", () => {
    it("rejects when required fields are missing or invalid", async () => {
      const formData = new FormData();
      formData.set("business_name", "A"); // too short (< 2)
      formData.set("contact_name", "John");
      formData.set("email", "invalid-email");
      formData.set("phone", "123"); // too short
      formData.set("city", "Chennai");
      formData.set("state", "Tamil Nadu");
      formData.set("counter_count", "2");
      // consent_given is missing

      const res = await submitDemoAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.fieldErrors).toBeDefined();
      expect(res.fieldErrors?.business_name).toBeDefined();
      expect(res.fieldErrors?.email).toBeDefined();
      expect(res.fieldErrors?.phone).toBeDefined();
      expect(res.fieldErrors?.consent_given).toBeDefined();
    });

    it("submits cleanly when all fields are valid", async () => {
      vi.spyOn(frappeServer, "submitDemoRequest").mockResolvedValueOnce({
        api_version: 1,
        request_id: "DEMO-2026-TEST",
        status: "Pending Review",
        message: "Demo request received successfully.",
      });

      const formData = new FormData();
      formData.set("business_name", "Sri Murugan Store");
      formData.set("contact_name", "K. Ramanathan");
      formData.set("email", "ramanathan@murugan.in");
      formData.set("phone", "+91 98400 12345");
      formData.set("city", "Madurai");
      formData.set("state", "Tamil Nadu");
      formData.set("counter_count", "3");
      formData.set("message", "We need ESC/POS printer setup.");
      formData.set("consent_given", "true");

      const res = await submitDemoAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data?.request_id).toBe("DEMO-2026-TEST");
      expect(res.data?.status).toBe("Pending Review");
    });
  });

  describe("submitOnboardingAction", () => {
    it("rejects when terms are not agreed to", async () => {
      const formData = new FormData();
      formData.set("business_name", "Annapoorna Groceries");
      formData.set("owner_name", "P. Kumar");
      formData.set("email", "kumar@annapoorna.in");
      formData.set("phone", "+91 94432 12345");
      formData.set("city", "Coimbatore");
      formData.set("state", "Tamil Nadu");
      formData.set("preferred_slug", "annapoorna-groceries");
      formData.set("requested_plan", "growth");
      // agreed_to_terms missing

      const res = await submitOnboardingAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.fieldErrors?.agreed_to_terms).toBeDefined();
    });

    it("rejects when preferred slug is a reserved keyword", async () => {
      vi.spyOn(frappeServer, "checkSlugAvailability").mockResolvedValueOnce({
        api_version: 1,
        slug: "admin",
        available: false,
        reason: "The slug 'admin' is a reserved platform keyword",
      });

      const formData = new FormData();
      formData.set("business_name", "Admin Store");
      formData.set("owner_name", "Owner");
      formData.set("email", "owner@admin.in");
      formData.set("phone", "+91 94432 12345");
      formData.set("city", "Coimbatore");
      formData.set("state", "Tamil Nadu");
      formData.set("preferred_slug", "admin");
      formData.set("requested_plan", "starter");
      formData.set("agreed_to_terms", "true");

      const res = await submitOnboardingAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.fieldErrors?.preferred_slug).toContain("reserved");
    });

    it("submits onboarding request when slug is available and data is valid", async () => {
      vi.spyOn(frappeServer, "checkSlugAvailability").mockResolvedValueOnce({
        api_version: 1,
        slug: "annapoorna-cbe",
        available: true,
      });

      vi.spyOn(frappeServer, "submitOnboardingRequest").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONB-2026-TEST",
        preferred_slug: "annapoorna-cbe",
        status: "Pending Review",
        message: "Store onboarding request submitted successfully.",
      });

      const formData = new FormData();
      formData.set("business_name", "Annapoorna Supermarket");
      formData.set("owner_name", "P. Kumar");
      formData.set("email", "kumar@annapoorna.in");
      formData.set("phone", "+91 94432 12345");
      formData.set("city", "Coimbatore");
      formData.set("state", "Tamil Nadu");
      formData.set("preferred_slug", "annapoorna-cbe");
      formData.set("requested_plan", "growth");
      formData.set("agreed_to_terms", "true");

      const res = await submitOnboardingAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data?.request_id).toBe("ONB-2026-TEST");
      expect(res.data?.status).toBe("Pending Review");
    });
  });

  describe("checkSlugAction", () => {
    it("returns availability status from backend service", async () => {
      vi.spyOn(frappeServer, "checkSlugAvailability").mockResolvedValueOnce({
        api_version: 1,
        slug: "fresh-mart",
        available: true,
      });

      const res = await checkSlugAction("fresh-mart");
      expect(res.available).toBe(true);
    });

    it("returns unavailable when backend reports reserved keyword", async () => {
      vi.spyOn(frappeServer, "checkSlugAvailability").mockResolvedValueOnce({
        api_version: 1,
        slug: "api",
        available: false,
        reason: "The slug 'api' is a reserved platform keyword",
      });

      const res = await checkSlugAction("api");
      expect(res.available).toBe(false);
      expect(res.reason).toContain("reserved");
    });
  });
});
