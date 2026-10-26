import { describe, expect, it, vi } from "vitest";
import { toggleFlagAction } from "./actions";
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
    expect(res.error).toContain("Authorization failed: System Manager role is required");
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
