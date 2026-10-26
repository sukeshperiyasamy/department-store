# India GST — Implementation and Validation

Date: 2026-10-27 · Status: **IMPLEMENTED_NOT_FULLY_TESTED** (software layer verified on the test site; legal/production sign-off explicitly NOT obtained)

## Compatibility check (verified)

- Site: ERPNext v16.52.1 on Frappe v16.53.0 (docker pwd stack)
- App installed: **india_compliance** from the official repository,
  branch **`version-16`** (dedicated v16 branch exists; `master` targets v15)
- Install verified: `bench get-app india_compliance <repo> --branch version-16`
  → `bench --site frontend install-app india_compliance` → "Thank you for installing India Compliance!"

## Configuration applied (test site, SYNTHETIC data only)

| Item | Value | Note |
| --- | --- | --- |
| Company GSTIN | `27XAAPCS1234A1Z5` | **format-valid but fictional** — never a real registration |
| PAN | `XAAPCS1234A` | synthetic |
| GST templates created | Intra-state 5%, Intra-state 18%, Inter-state IGST 18% (Demo) | use india_compliance's Output Tax CGST/SGST/IGST accounts |
| e-invoicing / e-waybill | **disabled** | applicability is a legal determination NOT made; no IRN/QR generation anywhere |
| HSN enforcement | active (india_compliance) | items require 6/8-digit HSN; demo items carry synthetic `999999` |

Non-interactive config via `departmental_store.gst_setup.setup` (runbook:
`bench --site frontend execute departmental_store.gst_setup.setup --kwargs "{'run': True}"`).

## Validation executed (2026-10-27, on the test site)

Ran `gst_setup.gst_validation_cases` — posts real invoices and reads back
ERPNext-computed taxes:

| Case | Input | Computed | Verdict |
| --- | --- | --- | --- |
| Intra-state 5% on ₹1000 | template 2.5+2.5 | CGST 25.00 + SGST 25.00 → grand **₹1050.00** | matches GST arithmetic |
| Intra-state 18% on ₹1000 | 9+9 | CGST 90.00 + SGST 90.00 → **₹1180.00** | matches |
| Inter-state 18% on ₹1000 | IGST 18 | IGST 180.00 → **₹1180.00** | matches |
| Rounding: 18% on ₹999 | 9+9 | 89.91 + 89.91 → **₹1178.82** | matches (ERP rounding rules) |
| **Real POS path** | sale via `submit_pos_sale` with the 18% template on the POS profile | net ₹100 → CGST 9.00 + SGST 9.00 → grand **₹118.00** (`SINV-26-00007`) | **the custom POS → ERP tax chain works** |

## What remains before production (explicitly unresolved)

1. **Accountant review**: template names/rates above are arithmetic demos; the
   store's real HSN→rate mapping, Cess, price-inclusive display rules, and
   RCM handling must be configured and approved by a qualified accountant.
2. **Real GSTIN**: the synthetic GSTIN must be replaced with the store's actual
   registration; GST Settings "GSTIN" child rows completed via the setup wizard.
3. **e-invoicing / e-waybill**: applicability depends on turnover and item
   categories (legal question). Software support exists via india_compliance but
   is disabled pending that determination + valid government credentials.
4. **Returns under GST**: credit notes flow through the ERP (verified in the
   returns workflow); GSTR-1 amendment/reconciliation behavior needs accountant
   review.
5. **GSTR filing/reports**: india_compliance provides GSTR-1/2B tooling — not
   validated here (needs real credentials + accountant).

**This document does not claim tax or legal compliance.** Software tests passing ≠ legal compliance.
