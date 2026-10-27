# Customer Feedback and Product Discovery Framework

## 1. Discovery Objective & Scope

The Departmental Store SaaS operates in high-velocity, real-world retail environments where store owners, managers, and cashiers rely on the system for daily survival and tax compliance. This framework establishes a structured, repeatable process to gather, triage, and act upon qualitative and operational feedback from authorized pilot stores (1–3 stores in Phase 9/10).

> **Privacy Guardrail**: Feedback collection strictly excludes employee surveillance, keystroke monitoring, biometric data, customer payment card details, and personal contact lists. All submitted diagnostic logs are redacted before intake.

---

## 2. Structured Feedback Intake Schema

Authorized participants submit feedback through the in-app support dialog, field support interviews, or structured review sessions. Every ticket records eight mandatory dimensions:

| Field Name | Description | Example Input |
| :--- | :--- | :--- |
| **1. Business Task & Role** | Specific retail task being performed and user role | `Cashier at Counter 2 scanning groceries during peak evening rush` |
| **2. Problem Encountered** | Concise, objective description of the friction | `Barcode scanner sends newline before full EAN-13 code registers, causing "Item Not Found"` |
| **3. Frequency & Impact** | How often it occurs and measurable business impact | `Occurs ~5 times per shift (100+ customers). Halts checkout line for 30–45s per incident.` |
| **4. Current Workaround** | How the user recovers today | `Cashier manually clears input with Esc and types 13-digit code on numpad.` |
| **5. Expected Outcome** | What the user expects the system to do | `Input buffer should debounce or normalize trailing whitespace and accept fast hardware scans cleanly.` |
| **6. Reproduction Steps** | Step-by-step instructions to recreate | `1. Focus barcode input. 2. Rapidly scan EAN-13 barcode with Honeywell scanner. 3. Observe input field.` |
| **7. Redacted Evidence** | Diagnostic snippet or screenshot with PII stripped | `[DIAGNOSTIC] Scanned raw: '8901030383712\r\n' -> Parsed: '8901030383712'` |
| **8. Acceptance Criteria** | Objective testable criteria for resolution | `Given a barcode with \r\n or whitespace, When scanned, Then the code is trimmed and matched without error.` |

---

## 3. Prioritization Matrix & Triage Rules

Feedback is prioritized based on business severity and financial integrity:

```
+------------------------------------------------------------------------------------+
| Tier 1: CRITICAL (Sev 1) — Immediate Hotfix Cycle                                  |
| - Blocked checkout billing or crash during active sales.                           |
| - Stock ledger corruption, tax calculation error, or GL discrepancy.               |
| - Offline queue dropped transactions or sync data loss.                            |
| - Security, cross-tenant leakage, or authentication failure.                       |
+-----------------------------------------+------------------------------------------+
                                          |
                                          v
+------------------------------------------------------------------------------------+
| Tier 2: HIGH (Sev 2) — Current Release Milestone (Phase 12)                       |
| - High-friction cashier workflow delays (scanner debouncing, receipt formatting).  |
| - Inability to configure essential store details (store name, phone, address).     |
| - Missing actionable stock reorder information.                                    |
| - In-app support request intake & diagnostic export.                               |
+-----------------------------------------+------------------------------------------+
                                          |
                                          v
+------------------------------------------------------------------------------------+
| Tier 3: MEDIUM (Sev 3) — Scheduled Roadmap Backlog                                |
| - Secondary report filtering and sorting enhancements.                             |
| - Staff permission customizations beyond standard Cashier/Manager roles.           |
| - Non-blocking UI terminology polish and layout responsiveness.                    |
+-----------------------------------------+------------------------------------------+
                                          |
                                          v
+------------------------------------------------------------------------------------+
| Tier 4: LOW / SPECULATIVE (Sev 4) — Deferred Until Proven by Real Demand           |
| - Voice recognition assistant in noisy grocery store environments.                 |
| - Third-party AI inventory forecasting.                                            |
| - WebRTC camera barcode scanning.                                                  |
+------------------------------------------------------------------------------------+
```

---

## 4. Privacy & Data Handling Compliance

1. **Anti-Surveillance Guarantee**: The platform does not track individual employee keystroke cadence, idle minutes, or break durations. Metrics track system operations, not individual person productivity.
2. **Customer Redaction**: Invoices attached to feedback reports must mask customer phone numbers (`9876****10`) and customer names (`Walk-In Customer`).
3. **Audit Trail**: Every customer feedback item is logged with a correlation ID and tracked in `docs/product/CUSTOMER_FEEDBACK_REGISTER.md`.
