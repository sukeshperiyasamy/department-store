# Feature Defect Register & Remediation Log

**Project:** Departmental Store ERP → Multi-Tenant SaaS Platform  
**Repository:** `sukeshperiyasamy/department-store`  
**Audit Baseline Commit:** `e96c387`  
**Auditor Roles:** Principal Software Architect, Senior QA Engineer, Security Engineer, ERPNext/Frappe Specialist, Full-Stack Engineer, and Release Auditor  
**Date of Audit:** 2026-10-28  

---

## 1. Defect Classification & Prioritization Schema

All identified issues are logged with actionable tracking attributes and prioritized per standard architectural triage:

1. **P1 — Critical:** Security vulnerabilities, cross-tenant data leaks, financial calculation errors, data loss, broken authentication.
2. **P2 — High:** Broken core workflows, missing backend persistence, crashed integrations.
3. **P3 — Medium:** Missing authorization guards, incomplete customer-facing UI screens, unverified recovery loops.
4. **P4 — Low / External:** Missing documentation, cosmetic alignment, deferred speculative features, external dependencies.

---

## 2. Master Defect & Gap Register

### DEF-01: Domain-Scoped Redis Cache Retained on Custom Domain Deletion
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-01** |
| **Affected Feature** | `SAAS-04` (Zero-Lock Redis Tenant Cache), `SAAS-07` (Custom Domain Symlink Routing) |
| **Severity** | **High** |
| **Reproduction Steps** | 1. Link and verify custom domain `pos.shopalpha-verified.local` to tenant `shopalpha.local`.<br>2. Send HTTP GET request via custom domain (caches metadata in Redis).<br>3. Admin invokes `remove_custom_domain("shopalpha", "pos.shopalpha-verified.local")`.<br>4. Send immediate HTTP GET request via removed custom domain within 300 seconds. |
| **Evidence** | Check 10 in `tests/integration/test_tenant_lifecycle_and_custom_domain.py` failed: `10_removed_custom_domain_immediately_fails_closed (status=200)` instead of expected HTTP 403 / 404. |
| **Root Cause** | In `provisioning.py`, `remove_custom_domain` only deleted `saas_tenant_lifecycle:{site_name}`, omitting the domain-scoped cache key `saas_tenant_lifecycle:{norm}`. Gunicorn retained the cached domain for 300s TTL. |
| **Proposed Fix** | In `provisioning.py`, delete both `saas_tenant_lifecycle:{site_name}` and `saas_tenant_lifecycle:{norm}` in `remove_custom_domain` and `verify_custom_domain`. In `set_tenant_status` and `verify_tenant_hostname`, iterate all custom domains and invalidate their Redis keys. In `tenant.py`, default host status to `"UNVERIFIED"` if unlisted. |
| **Regression Risk** | Low. Eliminates stale cache window; zero impact on valid tenants. |
| **Required Tests** | `test_tenant_lifecycle_and_custom_domain.py` Check 10. |
| **Status** | **RESOLVED & VERIFIED** (Committed in [`d09db02`](https://github.com/sukeshperiyasamy/department-store/commit/d09db02); 17/17 checks PASS). |
| **External Dependency** | None. |

---

### DEF-02: Cashier Shift Management Visual UI Screen Missing in POS
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-02** |
| **Affected Feature** | `POS-13` (Cashier Shift Management) |
| **Severity** | **Medium** |
| **Reproduction Steps** | 1. Launch Windows POS shell.<br>2. Cashier logs into billing counter.<br>3. Attempt to record opening cash float or perform end-of-shift cash drawer count.<br>4. No UI modal, screen, or button exists in the interface to trigger shift actions. |
| **Evidence** | Directory audit of `apps/windows-pos/src/ui/` showed `BillingScreen.tsx`, `PaymentScreen.tsx`, `ReturnsScreen.tsx`, and `SyncScreen.tsx`, but no Shift component. SQLite schema and repository methods in `repos.ts` were present but unexposed. |
| **Root Cause** | Backend SQLite table `shifts` and repository methods `openShift` / `closeShift` were developed during Phase 2, but the visual frontend modal was deferred and not integrated into the topbar shell. |
| **Proposed Fix** | 1. Implement `apps/windows-pos/src/ui/ShiftModal.tsx` allowing cashiers to view active shift, input opening cash float (₹), or close shift with physical cash count.<br>2. Expose `openShift`, `closeShift`, and `getCurrentShift` on `PosServices` in `store.tsx` and `services.ts`.<br>3. Add `Shift (F3)` button and keyboard listener to `Shell` in `apps/windows-pos/src/ui/App.tsx`.<br>4. Add unit test verifying `getCurrentShift` in `repos.test.ts`. |
| **Regression Risk** | Low. Purely additive UI modal; existing cart and payment workflows untouched. |
| **Required Tests** | `npm run test --workspace=apps/windows-pos` (`repos.test.ts`, `App.render.test.tsx`), `npm run typecheck`. |
| **Status** | **RESOLVED & VERIFIED** (Implemented in Phase 6; 80/80 POS tests PASS; 0 TypeScript errors). |
| **External Dependency** | None. |

---

### DEF-EXT-01: ESC/POS Thermal Receipt Printing Unexercised on Physical Hardware
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-01** |
| **Affected Feature** | `POS-11` (ESC/POS Thermal Receipt Printing) |
| **Severity** | **High (Commercial Launch Blocker `BLK-HW-01`)** |
| **Reproduction Steps** | Connect a physical TVS / Epson / Posiflex USB or Ethernet thermal receipt printer to the counter PC and attempt to print a live transaction receipt. |
| **Evidence** | Software generates exact ESC/POS byte streams (tested in `receipt.test.ts`), but spools to `%APPDATA%/departmental-pos/print_queue/`. No physical paper cut, barcode contrast, or Tamil font rendering has been tested on real paper. |
| **Root Cause** | Physical hardware delivery pending retail store procurement. |
| **Proposed Fix** | Procure target 80mm ESC/POS thermal printer; run on-site print verification script. |
| **Regression Risk** | Zero to software; print failures are isolated and never block or abort sales. |
| **Required Tests** | Physical hardware print run in retail pilot store. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-HW-01`)** |
| **External Dependency** | Physical 80mm ESC/POS thermal printer hardware delivery. |

---

### DEF-EXT-02: ZPL & TSPL Barcode Label Printing Unexercised on Physical Hardware
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-02** |
| **Affected Feature** | `POS-12` (ZPL / TSPL Shelf Label Generation) |
| **Severity** | **Medium (Hardware Delivery `BLK-HW-02`)** |
| **Reproduction Steps** | Send generated ZPL II / TSPL coordinate commands to a physical Zebra or TSC label printer. |
| **Evidence** | `labels.test.ts` validates coordinate generation and text bounds; physical label alignment and scanner readability unverified. |
| **Root Cause** | Physical label printer unavailable in test environment. |
| **Proposed Fix** | Validate barcode label printing on retail pilot label printer. |
| **Regression Risk** | None. |
| **Required Tests** | Physical barcode scanner scanability test on printed 50x25mm labels. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-HW-02`)** |
| **External Dependency** | Physical Zebra / TSC thermal label printer. |

---

### DEF-EXT-03: Indian GST Tax SAC Classification Lacks Formal CA Sign-Off
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-03** |
| **Affected Feature** | `ERP-13` (Indian GST Multi-Slab Tax Engine) |
| **Severity** | **Critical (Statutory Compliance Blocker `BLK-LEGAL-01`)** |
| **Reproduction Steps** | Review tax calculation invoices against statutory CGST/SGST rules. |
| **Evidence** | Software computes 50/50 intra-state CGST/SGST splits using synthetic GSTIN `33AAAAA0000A1Z5`. A legal memorandum from a qualified Chartered Accountant confirming SAC 998315 / 997331 classification is absent. |
| **Root Cause** | Legal compliance requirement requiring external human professional certification. |
| **Proposed Fix** | Retain Chartered Accountant to review SaaS subscription tax invoices and retail HSN tax mappings. |
| **Regression Risk** | None to software codebase. |
| **Required Tests** | Formal signed CA compliance review package. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-LEGAL-01`)** |
| **External Dependency** | Chartered Accountant statutory review. |

---

### DEF-EXT-04: Government e-Invoicing & e-Waybill NIC Production Credentials Absent
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-04** |
| **Affected Feature** | `ERP-14` (e-Invoicing / NIC Integration) |
| **Severity** | **High** |
| **Reproduction Steps** | Attempt to generate government IRN and signed QR code for high-value B2B sales (>₹5 Cr threshold). |
| **Evidence** | Deliberately unsimulated per `docs/known-limitations.md`. No mock IRNs are fabricated. |
| **Root Cause** | Requires live NIC GSP production credentials and taxpayer enrollment. |
| **Proposed Fix** | Confirm statutory B2B threshold applicability; configure NIC credentials if required. |
| **Regression Risk** | None. |
| **Required Tests** | Sandbox GSP API test with live NIC staging credentials. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY** |
| **External Dependency** | NIC e-Invoice Portal production credentials. |

---

### DEF-EXT-05: Traefik Wildcard Ingress Unexercised on Public Domain
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-05** |
| **Affected Feature** | `SAAS-08` (Traefik v3 Dynamic Ingress) |
| **Severity** | **High (Infrastructure Blocker `BLK-OPS-02`)** |
| **Reproduction Steps** | Route external HTTP/HTTPS traffic to `*.storeflo.in` over public internet. |
| **Evidence** | `docker-compose.traefik.yml` and `traefik.yml` pass static configuration validation; live ACME DNS-01 Let's Encrypt wildcard challenge cannot execute without public DNS delegation. |
| **Root Cause** | External staging VM and public DNS nameservers not yet provisioned by Platform Owner. |
| **Proposed Fix** | Deploy `docker-compose.traefik.yml` to public Linux staging VM; delegate DNS records. |
| **Regression Risk** | None. |
| **Required Tests** | `node tests/integration/staging_preflight_check.mjs` over public IP. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-OPS-02`)** |
| **External Dependency** | Public staging Linux VM and authoritative DNS wildcard delegation. |

---

### DEF-EXT-06: Live Razorpay Merchant KYC Verification Uncompleted
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-06** |
| **Affected Feature** | `BILL-03` (Live Subscription Checkout Orders) |
| **Severity** | **Critical (Commercial Launch Blocker `BLK-BIZ-01`)** |
| **Reproduction Steps** | Set `RAZORPAY_LIVE_MODE="true"` with live API key `rzp_live_...`. |
| **Evidence** | Execution fails closed with `PermissionError: Commercial live mode BLOCKED: External merchant KYC review and legal tax sign-off incomplete`. Verified in `test_billing_api.py`. |
| **Root Cause** | Business legal entity KYC document verification pending with Razorpay. |
| **Proposed Fix** | Platform Owner submits business bank account and PAN/GSTIN in Razorpay dashboard. |
| **Regression Risk** | None. Safe fail-closed guard prevents accidental live transaction attempts. |
| **Required Tests** | Live mode sandbox toggle verification test. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-BIZ-01`)** |
| **External Dependency** | Razorpay merchant KYC approval and production webhook secret. |

---

### DEF-EXT-07: Native Android APK & iOS IPA Binary Packaging Unbuilt
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-07** |
| **Affected Feature** | `MOB-07` (Mobile Binary Packaging) |
| **Severity** | **Medium (`BLK-OPS-03`)** |
| **Reproduction Steps** | Install mobile application on physical Android / iOS phone. |
| **Evidence** | TypeScript code passes all 11 unit tests; EAS cloud binary build commands unrun. |
| **Root Cause** | Apple Developer Account and Google Play Console store enrollments pending. |
| **Proposed Fix** | Configure signing credentials in EAS and generate `.apk` / `.ipa` release binaries. |
| **Regression Risk** | None. |
| **Required Tests** | Physical device smoke test on Android 14 and iOS 18. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-OPS-03`)** |
| **External Dependency** | Apple Developer / Google Play Console accounts. |

---

### DEF-EXT-08: S3 / Cloudflare R2 Offsite Replication Cloud Storage Unprovisioned
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-EXT-08** |
| **Affected Feature** | `OPS-02` (Hardened S3 Cloud Replication) |
| **Severity** | **Critical (Disaster Recovery Blocker `BLK-OPS-01`)** |
| **Reproduction Steps** | Execute `python deployment/backup/replicate_offsite.py --bucket prod-backups`. |
| **Evidence** | `test_replicate_offsite.py` passes 29/29 tests across all fault scenarios; running script against live endpoint fails closed when credentials are empty. |
| **Root Cause** | Platform Owner has not yet provisioned an isolated Cloudflare R2 or AWS S3 bucket. |
| **Proposed Fix** | Create private S3 bucket; configure IAM role with least-privilege `s3:PutObject` / `s3:GetObject` / `s3:ListBucket`; inject credentials. |
| **Regression Risk** | None. Local backups remain 100% durable in `%LOCALAPPDATA%` / `C:\Backups`. |
| **Required Tests** | Live test upload and SHA-256 download round-trip using test payload. |
| **Status** | **BLOCKED BY EXTERNAL DEPENDENCY (`BLK-OPS-01`)** |
| **External Dependency** | Cloudflare R2 or AWS S3 bucket credentials. |

---

### DEF-SPEC-01: Tamil Voice Assistant & Camera OCR Spec-Only Features
| Field | Detail |
| :--- | :--- |
| **Defect ID** | **DEF-SPEC-01** |
| **Affected Feature** | `POS-16` (Tamil Voice Assistant & Camera OCR) |
| **Severity** | **Low (Speculative / Non-Core)** |
| **Reproduction Steps** | Inspect settings flags in `apps/windows-pos/src/types/settings.ts`. |
| **Evidence** | Config flags exist; zero client or backend implementation exists. |
| **Root Cause** | Speculative ideation documented in early requirements; unproven acoustic accuracy in noisy retail environments. |
| **Proposed Fix** | Keep explicitly deferred per `docs/product/PRODUCT_GAP_ANALYSIS.md`. |
| **Regression Risk** | Zero. |
| **Required Tests** | N/A. |
| **Status** | **DEFERRED BY DESIGN** |
| **External Dependency** | Customer acoustic viability research. |

---

## 3. Remediation Verification Summary

| Defect ID | Severity | Status Before Audit | Status After Audit | Remediation Evidence |
| :--- | :---: | :---: | :---: | :--- |
| **DEF-01** | High | Unresolved | **RESOLVED** | Redis custom-domain cache eviction fixed in `provisioning.py`; verified in commit `d09db02` (17/17 checks PASS). |
| **DEF-02** | Medium | Unresolved | **RESOLVED** | `ShiftModal.tsx` built, wired to `PosServices`, topbar `Shift (F3)` added; verified with 80/80 POS unit tests & 0 type errors. |
| **DEF-EXT-01 to 08**| Critical/High | External Blocker | **PRESERVED AS BLOCKED** | Honesty-first reporting: isolated from code quality scores; external action checklist delivered to Platform Owner. |
| **DEF-SPEC-01**| Low | Spec-Only | **DEFERRED** | Formally documented as out-of-scope for v1 commercial launch. |
