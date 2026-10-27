import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  approveRequestAction,
  rejectRequestAction,
  retryJobAction,
  setTenantStatusAction,
} from "./admin";
import * as frappeServer from "@/lib/frappe-server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Platform Admin Server Actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("approveRequestAction", () => {
    it("rejects when request_id is missing", async () => {
      const formData = new FormData();
      formData.set("request_id", "");
      const res = await approveRequestAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toBeDefined();
    });

    it("approves request and returns job information on success", async () => {
      vi.spyOn(frappeServer, "approvePlatformOnboarding").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONB-100",
        status: "APPROVED",
        job_id: "JOB-2026-001",
        assigned_site_name: "annapoorna.localhost",
        message: "Request approved. Provisioning job queued.",
      });

      const formData = new FormData();
      formData.set("request_id", "ONB-100");
      formData.set("notes", "All documents verified");

      const res = await approveRequestAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
    });

    it("returns error message when backend throws PermissionError", async () => {
      vi.spyOn(frappeServer, "approvePlatformOnboarding").mockRejectedValueOnce(
        new Error("Platform Admin authorization required"),
      );

      const formData = new FormData();
      formData.set("request_id", "ONB-100");

      const res = await approveRequestAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toContain("Platform Admin authorization required");
    });
  });

  describe("rejectRequestAction", () => {
    it("rejects when reason is too short", async () => {
      const formData = new FormData();
      formData.set("request_id", "ONB-100");
      formData.set("reason", "no");

      const res = await rejectRequestAction(null, formData);
      expect(res.success).toBe(false);
      expect(res.message).toContain("at least 3 character");
    });

    it("successfully rejects request with valid reason", async () => {
      vi.spyOn(frappeServer, "rejectPlatformOnboarding").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONB-100",
        status: "REJECTED",
        message: "Onboarding request rejected.",
      });

      const formData = new FormData();
      formData.set("request_id", "ONB-100");
      formData.set("reason", "Incomplete store contact information");

      const res = await rejectRequestAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.message).toContain("rejected");
    });
  });

  describe("retryJobAction", () => {
    it("calls retry API on failed request", async () => {
      vi.spyOn(frappeServer, "retryPlatformProvisioning").mockResolvedValueOnce({
        api_version: 1,
        request_id: "ONB-100",
        status: "APPROVED",
        job_id: "JOB-RETRY-002",
        retry_count: 2,
        message: "Retry queued successfully",
      });

      const formData = new FormData();
      formData.set("request_id", "ONB-100");
      formData.set("reason", "Network error resolved");

      const res = await retryJobAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.message).toContain("Retry queued");
    });
  });

  describe("setTenantStatusAction", () => {
    it("rejects invalid status", async () => {
      const formData = new FormData();
      formData.set("tenant_id", "TID-001");
      formData.set("new_status", "INVALID_STATUS");
      formData.set("reason", "Testing invalid status");

      const res = await setTenantStatusAction(null, formData);
      expect(res.success).toBe(false);
    });

    it("updates tenant lifecycle status", async () => {
      vi.spyOn(frappeServer, "setPlatformTenantStatus").mockResolvedValueOnce({
        api_version: 1,
        tenant_id: "TID-001",
        status: "SUSPENDED",
        message: "Tenant status updated to 'SUSPENDED'.",
      });

      const formData = new FormData();
      formData.set("tenant_id", "TID-001");
      formData.set("new_status", "SUSPENDED");
      formData.set("reason", "Subscription non-payment");

      const res = await setTenantStatusAction(null, formData);
      expect(res.success).toBe(true);
    });
  });
});
