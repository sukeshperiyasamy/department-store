import { describe, expect, it, vi } from "vitest";
import {
  toggleFlagAction,
  updateStoreProfileAction,
  submitSupportRequestAction,
} from "./actions";
import * as frappeServer from "@/lib/frappe-server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("toggleFlagAction", () => {
  it("returns success when setFeatureFlag resolves cleanly", async () => {
    vi.spyOn(frappeServer, "setFeatureFlag").mockResolvedValueOnce({
      api_version: 1,
      flag: "voice_assistant_enabled",
      value: true,
    });

    const res = await toggleFlagAction("voice_assistant_enabled", true);
    expect(res.success).toBe(true);
    expect(res.flag).toBe("voice_assistant_enabled");
    expect(res.value).toBe(true);
  });

  it("returns user-friendly error on 403 / PermissionError authorization rejection", async () => {
    vi.spyOn(frappeServer, "setFeatureFlag").mockRejectedValueOnce(
      new Error("ERP authorization failed (403): PermissionError"),
    );

    const res = await toggleFlagAction("voice_assistant_enabled", true);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Authorization failed:");
  });

  it("handles generic server failure gracefully", async () => {
    vi.spyOn(frappeServer, "setFeatureFlag").mockRejectedValueOnce(
      new Error("Network timeout"),
    );

    const res = await toggleFlagAction("regional_catalog_enabled", false);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Failed to update regional_catalog_enabled: Network timeout");
  });
});

describe("updateStoreProfileAction", () => {
  it("returns success and updated profile when update succeeds", async () => {
    const mockProfile = {
      store_name: "Sri Amman Supermarket",
      store_phone: "9876543210",
      store_address: "56 Bazaar Street",
      receipt_header: "Welcome",
      receipt_footer: "Thank you",
      business_hours: "8 AM - 10 PM",
      tax_number: "33AAAAA0000A1Z5",
      currency_symbol: "₹",
      date_format: "DD-MM-YYYY",
    };
    vi.spyOn(frappeServer, "updateStoreProfile").mockResolvedValueOnce(mockProfile);

    const res = await updateStoreProfileAction({ store_name: "Sri Amman Supermarket" });
    expect(res.success).toBe(true);
    expect(res.profile?.store_name).toBe("Sri Amman Supermarket");
  });

  it("handles authorization rejection on profile update", async () => {
    vi.spyOn(frappeServer, "updateStoreProfile").mockRejectedValueOnce(
      new Error("ERP authorization failed (403): PermissionError"),
    );

    const res = await updateStoreProfileAction({ store_name: "Unauthorized Store" });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Authorization failed: Store Manager role is required");
  });
});

describe("submitSupportRequestAction", () => {
  it("validates and submits support ticket successfully", async () => {
    vi.spyOn(frappeServer, "submitSupportRequest").mockResolvedValueOnce({
      api_version: 1,
      ticket_id: "TKT-20261027-001",
      status: "RECEIVED",
      category: "POS_SYNC",
      priority: "HIGH",
      created_at: "2026-10-27T10:00:00Z",
      estimated_response_hours: 4,
    });

    const res = await submitSupportRequestAction({
      category: "POS_SYNC",
      subject: "Counter 2 offline sync stuck",
      description: "Counter 2 has 3 pending offline sales that have not synchronized.",
      priority: "HIGH",
    });

    expect(res.success).toBe(true);
    expect(res.result?.ticket_id).toBe("TKT-20261027-001");
  });

  it("returns error on validation or server failure", async () => {
    const res = await submitSupportRequestAction({
      category: "OTHER",
      subject: "Hi",
      description: "Short", // will fail min length 10
      priority: "NORMAL",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Failed to submit support request");
  });
});
