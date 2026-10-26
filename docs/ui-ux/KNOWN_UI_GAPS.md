# Known UI Gaps

Honest register of what the custom UI does NOT cover, and why.

## Not implemented (backend capability missing)

| Area | Why | Path forward |
| --- | --- | --- |
| POS shift UI (open/close, cash count, variance screen) | SQLite `shifts` table + repo methods exist; no API/UI wiring yet; server-side POS Opening Entry flow exists but is not exposed to the custom POS | Add shift screen + `open_shift`/`close_shift` sync methods |
| Returns / exchanges UI | ERPNext supports returns (credit notes) but the custom `submit_pos_sale` contract is v1 sales-only | Extend API v2 with return submission + original-invoice lookup UI |
| Label printing UI | ZPL/TSPL adapter pending actual printer model confirmation | Add label print panel after hardware confirmation |
| Voice assistant UI | Voice recognition not implemented | Design exists in docs; implement after core is hardware-verified |
| Mobile transaction creation | Deliberately out of scope (owner console is read/report-only by design) | Keep billing on counters |

## Handled by ERPNext Desk by design (not duplicated)

Purchasing/suppliers (POs, receipts, invoices, payments), customer master & loyalty, accounting/GST configuration and reports, stock reconciliation/adjustments, users/roles, backups. The Manager Console links the owner to outcomes (sales, stock alerts, sync health) while the Desk remains the transactional back office.

## Blocked

| Item | Blocker |
| --- | --- |
| Windows display-scaling visual checks (100/125/150%) | Tauri shell cannot be compiled on this machine (no Rust/MSVC) |
| POS sync screen screenshot with live pending data | Needs a real counter with queued transactions (desktop build) |
| Dashboard loading-skeleton screenshot | Server components resolve too fast locally to capture; skeletons exist in CSS |
| 20k-item catalog visual/perf check | Dataset not generated at that scale (300 used) |

## Cosmetic notes

- Catalog/Sales lists are server-paginated (25/page) without column sorting yet — acceptable at current scale; add sorting when >1000 rows are common.
- The dashboard date filter is a native date input (no custom range picker) — sufficient for v1.
- POS preview harness is excluded from the production build path (separate entry HTML; `npm run build` builds only `main.tsx`).
