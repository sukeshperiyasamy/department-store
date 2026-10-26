# Module & Screen Audit — 2026-10-26 (pre-redesign)

Traced from actual implementation (routes, Frappe methods, DocTypes), not from menu labels. Statuses: **Implemented** (working against real backend), **Partial**, **Gap** (backend exists but no UI), **Not implemented** (no backend either — do not fake).

## A. Owner dashboard (Next.js, port 3100)

| Route | Role | Data source | Pre-redesign state |
| --- | --- | --- | --- |
| `/login` | owner/manager | Frappe session login (server action) | Implemented, bare styling |
| `/` (dashboard) | manager/accountant | `departmental_store.api.reports.owner_summary` + `server_status` (zod-validated) | Implemented: 4 KPI cards, payment pie, cashier bar, counter health table |
| `/sync` | manager/accountant | `reports.server_status` | Implemented: devices, review queue, processing backlog |
| Catalog / Products | — | `api.catalog.catalog_snapshot` exists (any authenticated POS user) | **Gap** — API real, no UI |
| Sales list | — | ERPNext REST `/api/resource/Sales Invoice` (Accounts Manager can read) | **Gap** |
| Inventory alerts | — | no endpoint yet | **Not implemented** (added this cycle: `stock_alerts`) |
| Purchasing / suppliers / customers / staff / settings / reports | — | ERPNext Desk handles these natively | **Not applicable to custom UI this phase** — documented as ERPNext Desk responsibility |

## B. Windows POS (Tauri + React)

| Screen | Data source | Pre-redesign state |
| --- | --- | --- |
| Login (server URL, user, counter) | Frappe login + `devices.register_device` + `catalog_snapshot` | Implemented; dark theme |
| Billing | local SQLite catalog + `submit_pos_sale` via sync engine | Implemented: barcode-first search, cart, totals, F2/F4/F8; dark theme |
| Payment | local save + sync; server verdict | Implemented: cash/UPI/card, split, change estimate; dark theme |
| Sync/review | SQLite sales table + manual retry | Implemented: states, retry, reprint; dark theme |
| Shifts | SQLite shifts table (open/close exists in repo layer) | **Partial** — persistence exists, no UI screen |
| Returns/exchange | not implemented server-side | **Not implemented** |

## C. Design problems (pre-redesign)

1. POS uses a dark theme (`#10151c` background) — violates the mandated premium light direction; dashboard uses a different ad-hoc palette.
2. Dashboard lacks an application shell: no sidebar/navigation consistency, no header, no breadcrumbs; top nav is a single rounded bar.
3. No shared design tokens between the two apps; colors/spacing/radii diverge.
4. Missing states: no skeletons on the dashboard, no explicit empty-state components, login error styling minimal.
5. No mobile navigation strategy on the dashboard (nav bar becomes cramped); tables have no mobile strategy.
6. Catalog/Sales/Inventory data exists behind real APIs but has no screens.
7. Typography scale ad-hoc; KPI values inconsistent.

## D. Redesign scope decision (this cycle)

Implement: shared light design tokens; dashboard application shell (sidebar + header + mobile drawer); redesigned Dashboard (with date filter), Sync & Health, **new Catalog page** (real `catalog_snapshot`), **new Sales page** (real ERPNext REST), **new Inventory alerts page** (new real `stock_alerts` API added to the Frappe app), login page; POS restyled to the same light tokens with improved layout, touch targets and states.

Out of scope (documented, not faked): ERPNext Desk-native modules (purchasing, suppliers, customers, accounting, staff — the ERP provides these screens), POS shift UI, returns UI, voice UI, label printing UI. See KNOWN_UI_GAPS.md.
