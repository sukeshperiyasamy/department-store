# Feature Flag Governance and Release Control

## 1. Feature Flag Philosophy

Feature flags are used strictly to mitigate rollout risk, decouple deployment from release, and safeguard multi-tenant stability. Feature flags are not a permanent architectural substitute for modular code design. Every flag must have:
- A designated authorized operator.
- Server-side security enforcement.
- Immutable audit logging.
- Defined removal criteria.

---

## 2. Active Feature Flag Catalog

All platform flags reside in the Frappe DocType `Departmental Store Settings`. Only users with the `System Manager` role are authorized to modify them.

| Flag Name | Default State | Authorized Role | Targeting Rule | Rollout Risk Addressed | Rollback Procedure | Removal Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `batch_expiry_enabled` | `true` (1) | System Manager | Platform / Tenant | Enforces perishable batch tracking and expiry alerts. | `set_flag('batch_expiry_enabled', 0)` | Core feature (Permanent). |
| `receipt_printing_enabled` | `true` (1) | Store / Sys Manager | Counter Hardware | Thermal printer driver crash or paper-out blocking checkout. | Set to `false` in POS Settings. | Hardware driver toggle (Permanent). |
| `barcode_label_printing_enabled`| `true` (1) | Store / Sys Manager | Counter Hardware | TSC/Zebra thermal printer label generation. | Set to `false` in Settings. | Permanent hardware toggle. |
| `regional_catalog_enabled` | `true` (1) | System Manager | Platform | Multi-language and regional grocery catalog overrides. | Set to `false`. | Permanent catalog toggle. |
| `voice_assistant_enabled` | `false` (0) | System Manager | Canary Tenants Only | High-CPU speech synthesis and WebSpeech browser crashes. | `set_flag('voice_assistant_enabled', 0)` | Deprecate if adoption < 5% after 90 days. |
| `voice_hold_shortcut_enabled` | `false` (0) | System Manager | POS Billing | Accidental microphone trigger during fast barcode scans. | Set to `0`. | Remove when keyboard F-keys proven sufficient. |
| `ai_provider_enabled` | `false` (0) | System Manager | Platform Admin | Third-party LLM API latency, costs, and token leaks. | Set to `0` to instantly cut outbound API calls. | Transition to paid add-on or retire. |
| `mcp_adapter_enabled` | `false` (0) | System Manager | Platform Admin | Remote agent execution vulnerability. | Set to `0`. | Transition to sandboxed sidecar. |
| `camera_product_capture_enabled`| `false` (0) | System Manager | Owner Dashboard | Browser WebRTC webcam permission failures on mobile. | Set to `0`. | Standardize after cross-browser validation. |

---

## 3. Server-Side Enforcement & Security Boundaries

1. **Server-Side Enforcement**:
   - Client-side visibility (hiding a button or menu) is **never** a security boundary.
   - Backend APIs execute `require_flag("<flag_name>")`. If disabled, Frappe immediately aborts with:
     ```python
     frappe.PermissionError(f"Module '{flag}' is disabled in Departmental Store Settings")
     ```
2. **Suspended Tenant Session Invalidation**:
   - A tenant marked `SUSPENDED` or `ARCHIVED` in `tabSaaS Tenant` cannot bypass feature gating or access APIs.
   - Hostname resolution (`resolve_tenant_by_host`) and middleware verify tenant status on every request.
   - Suspended tenants immediately receive HTTP 403 Forbidden with `{ "error": "TENANT_SUSPENDED" }`. Stale browser cookies, cached JWTs, or older POS client versions cannot re-open billing or access inventory.
3. **Audit History**:
   - Every invocation of `set_flag()` generates a structured audit log entry in `departmental_store.log`:
     ```json
     {
       "event": "feature_flag_changed",
       "flag": "voice_assistant_enabled",
       "old": false,
       "new": true,
       "user": "administrator@departmental.local",
       "timestamp": "2026-10-27T18:00:00Z"
     }
     ```
