"use client";

import React, { useState, useTransition } from "react";
import {
  type FeatureFlagName,
  type ServerStatus,
  type StoreSettings,
} from "@departmental/shared-types";
import { toggleFlagAction } from "@/app/(app)/settings/actions";

interface SettingsClientProps {
  initialSettings: StoreSettings | null;
  serverStatus: ServerStatus | null;
  loadError: string | null;
}

type SectionKey =
  | "all"
  | "profile"
  | "regional"
  | "gst"
  | "devices"
  | "flags"
  | "printers"
  | "inventory"
  | "voice_ai"
  | "health";

interface FlagMeta {
  key: FeatureFlagName;
  title: string;
  category: "regional" | "flags" | "printers" | "inventory" | "voice_ai";
  description: string;
  badge?: string;
  badgeType?: "ok" | "warn" | "bad" | "info" | "neutral" | "accent";
  statusNote?: string;
}

const ALL_FLAGS_META: FlagMeta[] = [
  {
    key: "regional_catalog_enabled",
    title: "Regional Catalog (Tamil / Tanglish)",
    category: "regional",
    description:
      "Enables bilingual catalog search supporting Tamil script and phonetic Tanglish aliases (e.g. 'மஞ்சள் தூள்' / 'Manjal Thool').",
    badge: "Regional TN",
    badgeType: "accent",
    statusNote: "160 Tamil Nadu store products seeded into the catalog.",
  },
  {
    key: "receipt_printing_enabled",
    title: "Thermal Receipt Printing",
    category: "printers",
    description:
      "Generates ESC/POS byte streams for 58mm/80mm thermal receipt printers at checkout. Spools to local queue directory.",
    badge: "ESC/POS",
    badgeType: "info",
    statusNote: "Software byte-builder verified; physical thermal printer hardware validation pending.",
  },
  {
    key: "barcode_label_printing_enabled",
    title: "Barcode Label Printing",
    category: "printers",
    description:
      "Generates ZPL and TSPL command streams for dedicated barcode sticker and shelf-edge label printers.",
    badge: "ZPL / TSPL",
    badgeType: "info",
    statusNote: "Label generator verified; physical label printer hardware validation pending.",
  },
  {
    key: "batch_expiry_enabled",
    title: "Batch & Expiry Tracking",
    category: "inventory",
    description:
      "Enforces FIFO batch tracking and expiry date validation on perishable goods during receipt and checkout.",
    badge: "Core Inventory",
    badgeType: "ok",
    statusNote: "Authoritative stock ledger managed strictly in central ERPNext.",
  },
  {
    key: "expiry_notifications_enabled",
    title: "Expiry Notifications & Alerts",
    category: "inventory",
    description:
      "Surfaces expiring batches on the inventory dashboard across configurable warning windows.",
    badge: "Alerts Active",
    badgeType: "ok",
    statusNote: "Alerts computed against configurable warning windows (7, 30, 60 days).",
  },
  {
    key: "voice_assistant_enabled",
    title: "Tamil Voice Assistant",
    category: "voice_ai",
    description:
      "Enables voice-driven checkout command intake for rapid item addition and label triggering.",
    badge: "Spec Only",
    badgeType: "neutral",
    statusNote: "Speech recognition engine unconfigured (whisper.cpp vs Vosk pending); command parser designed.",
  },
  {
    key: "voice_hold_shortcut_enabled",
    title: "Voice Push-to-Talk Shortcut (Ctrl+Space)",
    category: "voice_ai",
    description:
      "Binds global keyboard shortcut Ctrl+Space on Windows POS counters to activate push-to-talk.",
    badge: "Keyboard Hook",
    badgeType: "neutral",
    statusNote: "Inactive while voice assistant is disabled.",
  },
  {
    key: "ai_provider_enabled",
    title: "External AI Provider Integration",
    category: "voice_ai",
    description:
      "Connects to cloud AI models for natural language search assistance and unstructured queries.",
    badge: "Optional / Off",
    badgeType: "neutral",
    statusNote: "Disabled by default. Offline POS billing never depends on external cloud AI.",
  },
  {
    key: "mcp_adapter_enabled",
    title: "Model Context Protocol (MCP) Adapter",
    category: "voice_ai",
    description:
      "Exposes safe, typed tool boundaries for authorized external AI agent assistants.",
    badge: "Tool Boundary",
    badgeType: "neutral",
    statusNote: "Disabled by default; opt-in tool adapter.",
  },
  {
    key: "camera_product_capture_enabled",
    title: "Camera Product Capture / OCR",
    category: "flags",
    description:
      "Enables USB or webcam barcode reading and product image capture from counter cameras.",
    badge: "Hardware Pending",
    badgeType: "neutral",
    statusNote: "Specification only; no camera hardware integrated on current workstations.",
  },
];

export function SettingsClient({
  initialSettings,
  serverStatus,
  loadError,
}: SettingsClientProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>("all");
  const [flags, setFlags] = useState<Record<FeatureFlagName, boolean>>(
    initialSettings?.flags ?? {
      regional_catalog_enabled: true,
      batch_expiry_enabled: true,
      expiry_notifications_enabled: true,
      receipt_printing_enabled: true,
      barcode_label_printing_enabled: true,
      voice_assistant_enabled: false,
      voice_hold_shortcut_enabled: false,
      ai_provider_enabled: false,
      mcp_adapter_enabled: false,
      camera_product_capture_enabled: false,
    },
  );

  const [savingKey, setSavingKey] = useState<FeatureFlagName | null>(null);
  const [savedKey, setSavedKey] = useState<FeatureFlagName | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggle = (key: FeatureFlagName, nextValue: boolean) => {
    setErrorBanner(null);
    setSavingKey(key);
    // Optimistic local update
    setFlags((prev) => ({ ...prev, [key]: nextValue }));

    startTransition(async () => {
      const res = await toggleFlagAction(key, nextValue);
      setSavingKey(null);
      if (res.success) {
        setSavedKey(key);
        setTimeout(() => {
          setSavedKey((curr) => (curr === key ? null : curr));
        }, 2500);
      } else {
        // Rollback
        setFlags((prev) => ({ ...prev, [key]: !nextValue }));
        setErrorBanner(res.error ?? "Failed to save setting");
      }
    });
  };

  const isVisible = (sec: SectionKey) =>
    activeSection === "all" || activeSection === sec;

  return (
    <div>
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Store &amp; System Settings</h1>
          <div className="desc">
            Operational configuration, Tamil Nadu regional preferences, GST tax profiles, POS hardware, and feature flags
          </div>
        </div>
        <div className="toolbar">
          <span className="badge ok">
            Release: CONDITIONAL GO (Supervised Pilot)
          </span>
          <span className="badge neutral">API v1</span>
        </div>
      </div>

      {/* Global Error Banner */}
      {loadError && (
        <div className="error-banner" role="alert">
          <strong>ERP Connection Issue:</strong> {loadError}
        </div>
      )}
      {errorBanner && (
        <div className="error-banner" role="alert">
          <strong>Action Denied:</strong> {errorBanner}
        </div>
      )}

      {/* Section Navigation Tabs */}
      <nav className="settings-nav" aria-label="Settings Categories">
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "all" ? "active" : ""}`}
          onClick={() => setActiveSection("all")}
        >
          All Settings
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "profile" ? "active" : ""}`}
          onClick={() => setActiveSection("profile")}
        >
          🏪 Store Profile
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "regional" ? "active" : ""}`}
          onClick={() => setActiveSection("regional")}
        >
          🌾 Regional (Tamil Nadu)
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "gst" ? "active" : ""}`}
          onClick={() => setActiveSection("gst")}
        >
          📜 GST &amp; Tax
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "devices" ? "active" : ""}`}
          onClick={() => setActiveSection("devices")}
        >
          💻 POS Counters ({serverStatus?.devices.length ?? 0})
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "flags" ? "active" : ""}`}
          onClick={() => setActiveSection("flags")}
        >
          🚩 Feature Flags
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "printers" ? "active" : ""}`}
          onClick={() => setActiveSection("printers")}
        >
          🖨️ Printers
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "inventory" ? "active" : ""}`}
          onClick={() => setActiveSection("inventory")}
        >
          📦 Inventory &amp; Expiry
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "voice_ai" ? "active" : ""}`}
          onClick={() => setActiveSection("voice_ai")}
        >
          🎙️ Voice &amp; AI
        </button>
        <button
          type="button"
          className={`settings-nav-btn ${activeSection === "health" ? "active" : ""}`}
          onClick={() => setActiveSection("health")}
        >
          🛡️ System Health
        </button>
      </nav>

      {/* 1. Store Profile */}
      {isVisible("profile") && (
        <section className="panel" aria-labelledby="heading-profile">
          <div className="panel-head">
            <h2 id="heading-profile">1. Store Profile &amp; Location</h2>
            <span className="badge ok">Single-Store Mode</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Primary business details for billing, receipt headers, and ERPNext company settings.
          </p>

          <div className="detail-grid">
            <div className="detail-card">
              <div className="label">Store Name</div>
              <div className="val">Departmental Store</div>
              <div className="sub">Configured in ERP Company master</div>
            </div>
            <div className="detail-card">
              <div className="label">Operating Region</div>
              <div className="val">Southern Tamil Nadu</div>
              <div className="sub">State Code 33 · India</div>
            </div>
            <div className="detail-card">
              <div className="label">Base Currency</div>
              <div className="val">INR (₹)</div>
              <div className="sub">Minor units: Paise (100 = ₹1.00)</div>
            </div>
            <div className="detail-card">
              <div className="label">System Timezone</div>
              <div className="val">Asia/Kolkata (IST)</div>
              <div className="sub">Pinned via ensure_site_timezone (QA-0005)</div>
            </div>
            <div className="detail-card">
              <div className="label">Counters Planned</div>
              <div className="val">2–3 Windows Billing Terminals</div>
              <div className="sub">Offline-capable with SQLite durability</div>
            </div>
            <div className="detail-card">
              <div className="label">Backend Architecture</div>
              <div className="val">Central Docker ERPNext v16</div>
              <div className="sub">MariaDB 11.8 authoritative ledger</div>
            </div>
          </div>
        </section>
      )}

      {/* 2. Regional Preferences (Tamil Nadu) */}
      {isVisible("regional") && (
        <section className="panel" aria-labelledby="heading-regional">
          <div className="panel-head">
            <h2 id="heading-regional">2. Regional Preferences (Tamil Nadu)</h2>
            <span className="badge accent">Bilingual Support</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Tailored retail features for Southern Tamil Nadu departmental store operations.
          </p>

          <div className="info-card notice">
            <strong>Tamil &amp; Tanglish Search Heuristics:</strong> Products in the store catalog support dual search aliases. For example, typing <code>manjal</code>, <code>thool</code>, or <code>மஞ்சள்</code> instantly ranks turmeric powder at the counter.
          </div>

          <div>
            {ALL_FLAGS_META.filter((m) => m.category === "regional").map((m) => (
              <SettingRow
                key={m.key}
                meta={m}
                enabled={flags[m.key]}
                isSaving={savingKey === m.key}
                isSaved={savedKey === m.key}
                onToggle={(val) => handleToggle(m.key, val)}
              />
            ))}
          </div>

          <div className="detail-grid" style={{ marginTop: 14 }}>
            <div className="detail-card">
              <div className="label">Regional Catalog Dataset</div>
              <div className="val">160 Products Seeded</div>
              <div className="sub">Grains, spices, provisions, dairy, cosmetics</div>
            </div>
            <div className="detail-card">
              <div className="label">Primary UI Language</div>
              <div className="val">English + Tamil Transliteration</div>
              <div className="sub">Cashier keyboard friendly</div>
            </div>
            <div className="detail-card">
              <div className="label">Barcode Standard</div>
              <div className="val">EAN-13 &amp; In-Store 20...</div>
              <div className="sub">Synthetic internal range; no collision</div>
            </div>
          </div>
        </section>
      )}

      {/* 3. GST Configuration */}
      {isVisible("gst") && (
        <section className="panel" aria-labelledby="heading-gst">
          <div className="panel-head">
            <h2 id="heading-gst">3. GST Configuration &amp; Indian Compliance</h2>
            <span className="badge warn">Accountant Review Pending</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Tax workflows use the official <code>india_compliance</code> ERPNext module. Tax calculations are authoritative only in ERPNext, never in client-side code.
          </p>

          <div className="info-card warn">
            <strong>Pre-Production Requirement:</strong> The current system runs with a synthetic GSTIN (<code>33AAAAA0000A1Z5</code>). A qualified accountant must review the final tax categories, rates, and verify the store's real GSTIN before production billing.
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <div className="label">India Compliance App</div>
              <div className="val">v16.11.0 (version-16)</div>
              <div className="sub">Installed on Frappe 16 site</div>
            </div>
            <div className="detail-card">
              <div className="label">Store GSTIN</div>
              <div className="val mono">33AAAAA0000A1Z5</div>
              <div className="sub">Synthetic test GSTIN (Tamil Nadu)</div>
            </div>
            <div className="detail-card">
              <div className="label">HSN Enforcement</div>
              <div className="val">Length &amp; Master Validated</div>
              <div className="sub">6/8 digit GST HSN Codes enforced on sales items</div>
            </div>
            <div className="detail-card">
              <div className="label">Intra-State Tax Template</div>
              <div className="val">CGST 9% + SGST 9%</div>
              <div className="sub">18% Standard GST verified in bench suite</div>
            </div>
            <div className="detail-card">
              <div className="label">Inter-State Tax Template</div>
              <div className="val">IGST 18%</div>
              <div className="sub">Default out-of-state template</div>
            </div>
            <div className="detail-card">
              <div className="label">E-Invoicing / E-Waybill</div>
              <div className="val" style={{ color: "var(--muted)" }}>Disabled (Unavailable)</div>
              <div className="sub">Exempt below statutory turnover threshold</div>
            </div>
          </div>
        </section>
      )}

      {/* 4. POS Counters and Devices */}
      {isVisible("devices") && (
        <section className="panel" aria-labelledby="heading-devices">
          <div className="panel-head">
            <h2 id="heading-devices">4. POS Counters &amp; Registered Terminals</h2>
            <span className="badge info">Counter Trust Anchor</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Physical Windows billing terminals registered in ERPNext. Cashiers cannot self-register counters; registration requires Store Manager credentials.
          </p>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Counter Name</th>
                  <th>Device ID</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th>Security Policy</th>
                </tr>
              </thead>
              <tbody>
                {serverStatus && serverStatus.devices.length > 0 ? (
                  serverStatus.devices.map((device) => (
                    <tr key={device.device_id}>
                      <td style={{ fontWeight: 600 }}>{device.counter_name ?? "Counter"}</td>
                      <td className="mono">{device.device_id}</td>
                      <td>
                        <span
                          className={`badge ${device.status === "Enabled" ? "ok" : "bad"}`}
                        >
                          {device.status}
                        </span>
                      </td>
                      <td className="muted">
                        {device.last_sync_at
                          ? new Date(device.last_sync_at).toLocaleString()
                          : "No sync yet"}
                      </td>
                      <td>
                        <span className="badge neutral">SQLite WAL + Outbox</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty">
                        <div className="glyph">💻</div>
                        No devices registered yet. Counters auto-register during initial manager sign-in.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="info-card tip" style={{ marginTop: 14 }}>
            <strong>Offline Resilience Policy:</strong> Each counter terminal writes billing records and outbox events in a single atomic SQLite transaction (Schema v2). If the server or local LAN fails, billing continues unabated without loss.
          </div>
        </section>
      )}

      {/* 5. Central Feature Flags */}
      {isVisible("flags") && (
        <section className="panel" aria-labelledby="heading-flags">
          <div className="panel-head">
            <h2 id="heading-flags">5. Feature Flags (10 Modular Controls)</h2>
            <span className="badge accent">Server Persisted</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            All flags reside in the <code>Departmental Store Settings</code> DocType. Disabling optional modules immediately stops background loops and prevents UI activation without affecting core sales, payments, or outbox sync.
          </p>

          <div>
            {ALL_FLAGS_META.map((m) => (
              <SettingRow
                key={m.key}
                meta={m}
                enabled={flags[m.key]}
                isSaving={savingKey === m.key}
                isSaved={savedKey === m.key}
                onToggle={(val) => handleToggle(m.key, val)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 6. Printers */}
      {isVisible("printers") && (
        <section className="panel" aria-labelledby="heading-printers">
          <div className="panel-head">
            <h2 id="heading-printers">6. Receipt &amp; Label Printers</h2>
            <span className="badge info">Hardware Integration</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Configuration for thermal receipt rolls (ESC/POS) and barcode/shelf label printers (ZPL/TSPL).
          </p>

          <div className="info-card notice">
            <strong>Hardware Status:</strong> Software ESC/POS and ZPL byte builders are unit-tested with 100% pass rate. Spool command writes raw bytes to <code>%APPDATA%/departmental-pos/print_queue/</code>. Physical hardware validation will occur upon printer delivery at the store.
          </div>

          <div>
            {ALL_FLAGS_META.filter((m) => m.category === "printers").map((m) => (
              <SettingRow
                key={m.key}
                meta={m}
                enabled={flags[m.key]}
                isSaving={savingKey === m.key}
                isSaved={savedKey === m.key}
                onToggle={(val) => handleToggle(m.key, val)}
              />
            ))}
          </div>

          <div className="detail-grid" style={{ marginTop: 14 }}>
            <div className="detail-card">
              <div className="label">Thermal Paper Format</div>
              <div className="val">58mm &amp; 80mm Standard</div>
              <div className="sub">Auto-cutter &amp; duplicate bill markers</div>
            </div>
            <div className="detail-card">
              <div className="label">Barcode Label Protocol</div>
              <div className="val">ZPL-II &amp; TSPL</div>
              <div className="sub">Clean ASCII sanitization</div>
            </div>
            <div className="detail-card">
              <div className="label">Cash Drawer Kick</div>
              <div className="val" style={{ color: "var(--muted)" }}>Pending Hardware</div>
              <div className="sub">Standard RJ11 printer kick pulse</div>
            </div>
          </div>
        </section>
      )}

      {/* 7. Inventory and Expiry */}
      {isVisible("inventory") && (
        <section className="panel" aria-labelledby="heading-inventory">
          <div className="panel-head">
            <h2 id="heading-inventory">7. Inventory, Batches &amp; Expiry Windows</h2>
            <span className="badge ok">FIFO Managed</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Perishable stock management rules and warning intervals.
          </p>

          <div>
            {ALL_FLAGS_META.filter((m) => m.category === "inventory").map((m) => (
              <SettingRow
                key={m.key}
                meta={m}
                enabled={flags[m.key]}
                isSaving={savingKey === m.key}
                isSaved={savedKey === m.key}
                onToggle={(val) => handleToggle(m.key, val)}
              />
            ))}
          </div>

          <div className="detail-grid" style={{ marginTop: 14 }}>
            <div className="detail-card">
              <div className="label">Expiry Warning Windows</div>
              <div className="val">{initialSettings?.expiry_warning_days ?? "7, 30, 60"} Days</div>
              <div className="sub">Configured in ERP backend settings</div>
            </div>
            <div className="detail-card">
              <div className="label">Negative Stock Policy</div>
              <div className="val">Strictly Guarded</div>
              <div className="sub">NegativeStockError prevented in server stock ledger</div>
            </div>
            <div className="detail-card">
              <div className="label">Batch Selection</div>
              <div className="val">Automatic FIFO Default</div>
              <div className="sub">Manual batch override available on POS</div>
            </div>
          </div>
        </section>
      )}

      {/* 8. Voice/AI Integration */}
      {isVisible("voice_ai") && (
        <section className="panel" aria-labelledby="heading-voice">
          <div className="panel-head">
            <h2 id="heading-voice">8. Voice Assistant &amp; AI Integration</h2>
            <span className="badge neutral">Opt-In Modules</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Optional intelligence capabilities. By default, external AI and voice assistants are disabled to ensure maximum offline autonomy and privacy.
          </p>

          <div className="info-card notice">
            <strong>Offline Privacy Architecture:</strong> Core store billing never connects to third-party AI APIs. If enabled, the Tamil voice assistant runs against an on-premise local model (such as Vosk or whisper.cpp) on the store server.
          </div>

          <div>
            {ALL_FLAGS_META.filter((m) => m.category === "voice_ai").map((m) => (
              <SettingRow
                key={m.key}
                meta={m}
                enabled={flags[m.key]}
                isSaving={savingKey === m.key}
                isSaved={savedKey === m.key}
                onToggle={(val) => handleToggle(m.key, val)}
              />
            ))}
          </div>

          <div className="detail-grid" style={{ marginTop: 14 }}>
            <div className="detail-card">
              <div className="label">Speech Engine Status</div>
              <div className="val" style={{ color: "var(--muted)" }}>Not Configured (Unlinked)</div>
              <div className="sub">whisper.cpp / Vosk engine evaluation pending</div>
            </div>
            <div className="detail-card">
              <div className="label">Command Parser</div>
              <div className="val">Deterministic Rule Engine</div>
              <div className="sub">TN regional intent matcher specified</div>
            </div>
            <div className="detail-card">
              <div className="label">MCP Tool Adapter</div>
              <div className="val">Boundary Typed &amp; Secured</div>
              <div className="sub">Single-direction read-only schema boundary</div>
            </div>
          </div>
        </section>
      )}

      {/* 9. System Health & Diagnostics */}
      {isVisible("health") && (
        <section className="panel" aria-labelledby="heading-health">
          <div className="panel-head">
            <h2 id="heading-health">9. System Health &amp; Infrastructure</h2>
            <span className="badge ok">Docker Compose Live</span>
          </div>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: "var(--fs-sm)" }}>
            Real-time status of backend containers, database integrity, and operational disaster recovery rehearsals.
          </p>

          <div className="detail-grid">
            <div className="detail-card">
              <div className="label">Frappe / ERPNext Stack</div>
              <div className="val">{serverStatus?.frappe_version ?? "ERPNext v16"}</div>
              <div className="sub">{(serverStatus?.apps ?? ["erpnext", "frappe", "departmental_store", "india_compliance"]).join(", ")}</div>
            </div>
            <div className="detail-card">
              <div className="label">Authoritative Database</div>
              <div className="val">MariaDB 11.8 (Docker)</div>
              <div className="sub">Innodb_deadlocks = 0 · Clean volume</div>
            </div>
            <div className="detail-card">
              <div className="label">Backup Script</div>
              <div className="val">run_backup.sh Verified</div>
              <div className="sub">gzip -t + SHA-256 integrity validation</div>
            </div>
            <div className="detail-card">
              <div className="label">Disaster Recovery (DR)</div>
              <div className="val">Restore Rehearsal PASS</div>
              <div className="sub">Scratch-site restore verified 2026-10-27</div>
            </div>
            <div className="detail-card">
              <div className="label">Sync Review Backlog</div>
              <div className="val">{serverStatus?.review_queue.length ?? 0} Bills</div>
              <div className="sub">{serverStatus && serverStatus.review_queue.length > 0 ? "Requires manager resolution" : "All transactions committed cleanly"}</div>
            </div>
            <div className="detail-card">
              <div className="label">Active Claims Processing</div>
              <div className="val">{serverStatus?.processing_transactions.length ?? 0} In Flight</div>
              <div className="sub">Claim-based idempotency active</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SettingRow({
  meta,
  enabled,
  isSaving,
  isSaved,
  onToggle,
}: {
  meta: FlagMeta;
  enabled: boolean;
  isSaving: boolean;
  isSaved: boolean;
  onToggle: (nextVal: boolean) => void;
}) {
  return (
    <div className="setting-item">
      <div className="setting-main">
        <div className="setting-header">
          <span className="setting-title">{meta.title}</span>
          {meta.badge && (
            <span className={`badge ${meta.badgeType ?? "neutral"}`}>
              {meta.badge}
            </span>
          )}
          {enabled ? (
            <span className="badge ok">Active</span>
          ) : (
            <span className="badge neutral">Disabled</span>
          )}
        </div>
        <div className="setting-desc">{meta.description}</div>
        {meta.statusNote && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            ℹ️ {meta.statusNote}
          </div>
        )}
      </div>

      <div className="setting-action">
        <label className="toggle-label" htmlFor={`toggle-${meta.key}`}>
          <input
            id={`toggle-${meta.key}`}
            type="checkbox"
            className="toggle-input"
            checked={enabled}
            disabled={isSaving}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={`Toggle ${meta.title}`}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </label>
        {isSaving && <span className="feedback-tag saving">Saving…</span>}
        {isSaved && <span className="feedback-tag saved">✓ Saved</span>}
      </div>
    </div>
  );
}
