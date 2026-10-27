import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  saveDemoRequestLocal,
  saveOnboardingRequestLocal,
} from "./lead-storage";

describe("Local Lead Storage Outbox", () => {
  const testDemoId = "DEMO-TEST-LOCAL-01";
  const testOnbId = "ONB-TEST-LOCAL-01";

  it("persists demo lead locally in demo_requests.json", () => {
    const demoData = {
      business_name: "Test Store",
      contact_name: "Test Person",
      email: "test@store.in",
      phone: "+91 98400 12345",
      city: "Chennai",
      state: "Tamil Nadu",
      counter_count: 2,
      message: "Test message",
      consent_given: true as const,
    };

    const record = saveDemoRequestLocal(demoData, testDemoId, false);
    expect(record.id).toBe(testDemoId);
    expect(record.business_name).toBe("Test Store");
    expect(record.synced_to_erp).toBe(false);

    const outboxPath = path.join(process.cwd(), ".leads-outbox", "demo_requests.json");
    expect(fs.existsSync(outboxPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outboxPath, "utf-8"));
    const found = content.find((item: { id: string }) => item.id === testDemoId);
    expect(found).toBeDefined();
    expect(found.email).toBe("test@store.in");
  });

  it("persists onboarding lead locally in onboarding_requests.json", () => {
    const onbData = {
      business_name: "Test Supermarket",
      owner_name: "Test Owner",
      email: "owner@test.in",
      phone: "+91 94432 12345",
      state: "Tamil Nadu",
      city: "Madurai",
      preferred_slug: "test-supermarket",
      requested_plan: "growth" as const,
      agreed_to_terms: true as const,
    };

    const record = saveOnboardingRequestLocal(onbData, testOnbId, true);
    expect(record.id).toBe(testOnbId);
    expect(record.preferred_slug).toBe("test-supermarket");
    expect(record.status).toBe("Pending Review");
    expect(record.synced_to_erp).toBe(true);

    const outboxPath = path.join(process.cwd(), ".leads-outbox", "onboarding_requests.json");
    expect(fs.existsSync(outboxPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(outboxPath, "utf-8"));
    const found = content.find((item: { id: string }) => item.id === testOnbId);
    expect(found).toBeDefined();
    expect(found.preferred_slug).toBe("test-supermarket");
  });
});
