import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { SettingsClient } from "./SettingsClient";
import { type ServerStatus, type StoreSettings } from "@departmental/shared-types";

// Mock the server action
vi.mock("@/app/(app)/settings/actions", () => ({
  toggleFlagAction: vi.fn().mockResolvedValue({ success: true }),
}));

const mockSettings: StoreSettings = {
  api_version: 1,
  flags: {
    voice_assistant_enabled: false,
    voice_hold_shortcut_enabled: false,
    ai_provider_enabled: false,
    mcp_adapter_enabled: false,
    camera_product_capture_enabled: false,
    batch_expiry_enabled: true,
    expiry_notifications_enabled: true,
    regional_catalog_enabled: true,
    receipt_printing_enabled: true,
    barcode_label_printing_enabled: true,
  },
  expiry_warning_days: "7,30,60",
};

const mockServerStatus: ServerStatus = {
  api_version: 1,
  generated_at: "2026-10-27T04:00:00Z",
  frappe_version: "Frappe v16.53.0 / ERPNext v16.52.1",
  apps: ["erpnext", "frappe", "departmental_store", "india_compliance"],
  database: {
    engine: "MariaDB",
    version: "11.8.9-MariaDB-ubu2404",
    innodb_deadlocks: 0,
  },
  devices: [
    {
      device_id: "pos-counter-01",
      counter_name: "Billing Counter 1",
      status: "Enabled",
      last_sync_at: "2026-10-27T03:55:00Z",
    },
    {
      device_id: "pos-counter-02",
      counter_name: "Billing Counter 2",
      status: "Enabled",
      last_sync_at: null,
    },
  ],
  processing_transactions: [],
  review_queue: [],
};

describe("SettingsClient component", () => {
  it("renders all 9 settings sections in default view", () => {
    const html = renderToString(
      <SettingsClient
        initialSettings={mockSettings}
        serverStatus={mockServerStatus}
        loadError={null}
      />,
    );

    // Section 1: Store Profile
    expect(html).toContain("1. Store Profile &amp; Location");
    expect(html).toContain("Southern Tamil Nadu");
    expect(html).toContain("Asia/Kolkata (IST)");
    expect(html).toContain("Single-Store Mode");

    // Section 2: Regional Preferences
    expect(html).toContain("2. Regional Preferences (Tamil Nadu)");
    expect(html).toContain("Regional Catalog (Tamil / Tanglish)");
    expect(html).toContain("160 Products Seeded");

    // Section 3: GST Configuration
    expect(html).toContain("3. GST Configuration &amp; Indian Compliance");
    expect(html).toContain("33AAAAA0000A1Z5");
    expect(html).toContain("CGST 9% + SGST 9%");
    expect(html).toContain("DEMO CONFIG / ACCOUNTANT REVIEW REQUIRED");
    expect(html).toContain("SYNTHETIC / DEMO GST PROFILE (NOT APPROVED FOR LEGAL TAX FILING)");

    // Section 4: POS Counters and Devices
    expect(html).toContain("4. POS Counters &amp; Registered Terminals");
    expect(html).toContain("pos-counter-01");
    expect(html).toContain("Billing Counter 1");
    expect(html).toContain("SQLite WAL + Outbox");

    // Section 5: Feature Flags
    expect(html).toContain("5. Feature Flags (10 Modular Controls)");

    // Section 6: Printers
    expect(html).toContain("6. Receipt &amp; Label Printers");
    expect(html).toContain("Thermal Receipt Printing");
    expect(html).toContain("Barcode Label Printing");

    // Section 7: Inventory & Expiry
    expect(html).toContain("7. Inventory, Batches &amp; Expiry Windows");
    expect(html).toContain("7,30,60");

    // Section 8: Voice & AI Integration
    expect(html).toContain("8. Voice Assistant &amp; AI Integration");
    expect(html).toContain("Tamil Voice Assistant");
    expect(html).toContain("Not Configured (Unlinked)");

    // Section 9: System Health & Diagnostics
    expect(html).toContain("9. System Health &amp; Infrastructure");
    expect(html).toContain("11.8.9-MariaDB-ubu2404");
    expect(html).toContain("Innodb_deadlocks = 0 (Live query)");
    expect(html).toContain("2 Verified Local Snapshots");
  });

  it("renders honest labels for unavailable and pending hardware features", () => {
    const html = renderToString(
      <SettingsClient
        initialSettings={mockSettings}
        serverStatus={mockServerStatus}
        loadError={null}
      />,
    );

    // E-invoicing explicitly unavailable
    expect(html).toContain("Disabled (Unavailable)");
    expect(html).toContain("Exempt below statutory turnover threshold");

    // Speech engine not configured
    expect(html).toContain("Not Configured (Unlinked)");

    // Hardware status notes
    expect(html).toContain("physical thermal printer hardware validation pending");
    expect(html).toContain("physical label printer hardware validation pending");

    // Release status badge
    expect(html).toContain("CONDITIONAL GO (Supervised Pilot)");
  });

  it("renders all 10 feature flags with unique section IDs and accessible switch attributes", () => {
    const html = renderToString(
      <SettingsClient
        initialSettings={mockSettings}
        serverStatus={mockServerStatus}
        loadError={null}
      />,
    );

    // Enabled flags have checked attribute and role="switch"
    const regionalInput = html.match(/<input[^>]+toggle-regional-regional_catalog_enabled[^>]*>/)?.[0];
    const expiryInput = html.match(/<input[^>]+toggle-inventory-batch_expiry_enabled[^>]*>/)?.[0];
    const receiptInput = html.match(/<input[^>]+toggle-printers-receipt_printing_enabled[^>]*>/)?.[0];
    const centralInput = html.match(/<input[^>]+toggle-central-regional_catalog_enabled[^>]*>/)?.[0];

    expect(regionalInput).toBeDefined();
    expect(regionalInput).toContain('role="switch"');
    expect(regionalInput).toContain('aria-checked="true"');
    expect(regionalInput).toContain('checked=""');

    expect(centralInput).toBeDefined();
    expect(centralInput).toContain('role="switch"');
    expect(centralInput).toContain('aria-checked="true"');

    expect(expiryInput).toBeDefined();
    expect(expiryInput).toContain('role="switch"');
    expect(expiryInput).toContain('checked=""');

    expect(receiptInput).toBeDefined();
    expect(receiptInput).toContain('role="switch"');
    expect(receiptInput).toContain('checked=""');

    // Disabled flags do not have checked attribute and aria-checked="false"
    const voiceInput = html.match(/<input[^>]+toggle-voice-voice_assistant_enabled[^>]*>/)?.[0];
    const aiInput = html.match(/<input[^>]+toggle-voice-ai_provider_enabled[^>]*>/)?.[0];
    expect(voiceInput).toBeDefined();
    expect(voiceInput).toContain('role="switch"');
    expect(voiceInput).toContain('aria-checked="false"');
    expect(voiceInput).not.toContain('checked=""');

    expect(aiInput).toBeDefined();
    expect(aiInput).toContain('role="switch"');
    expect(aiInput).toContain('aria-checked="false"');
    expect(aiInput).not.toContain('checked=""');
  });

  it("displays error banner when loadError is provided", () => {
    const html = renderToString(
      <SettingsClient
        initialSettings={mockSettings}
        serverStatus={null}
        loadError="Could not reach ERP on port 8080"
      />,
    );
    expect(html).toContain("ERP Connection Issue:");
    expect(html).toContain("Could not reach ERP on port 8080");
  });

  it("never exposes sensitive tokens or credentials in rendered markup", () => {
    const html = renderToString(
      <SettingsClient
        initialSettings={mockSettings}
        serverStatus={mockServerStatus}
        loadError={null}
      />,
    );
    expect(html).not.toContain("api_secret");
    expect(html).not.toContain("DASHBOARD_API_SECRET");
    expect(html).not.toContain("b05070c17f954ab");
    expect(html).not.toContain("password");
  });
});
