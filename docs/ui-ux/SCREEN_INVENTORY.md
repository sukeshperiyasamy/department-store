# Screen Inventory (post-redesign)

## Manager Console (apps/owner-dashboard, Next.js, :3100)

| Route | Screen | Status | Data source |
| --- | --- | --- | --- |
| `/login` | Sign-in card | **Redesigned** | Frappe session login |
| `/` | Dashboard: 4 KPI cards, payment mix + cashier charts, recent bills, counter health, date filter | **Redesigned + live-verified** | `owner_summary`, `server_status`, `recent_invoices` |
| `/catalog` | Product catalog: search (code/name/alias/barcode), pagination, price/barcode/aliases | **New** | `catalog_snapshot` |
| `/sales` | Submitted bills: KPIs, status badges, returns, pagination | **New** | `recent_invoices` |
| `/inventory` | Alerts: out-of-stock, below-reorder, expiring batches, expiry-window filter | **New** | `stock_alerts` |
| `/sync` | Counters, review queue, processing backlog, ERP version | **Redesigned** | `server_status` |
| `/settings` | Store Profile, Regional (TN), GST, Counters, Feature Flags (10), Printers, Inventory, Voice/AI, Health | **New + live-verified** | `get_settings`, `set_flag`, `server_status` |
| Shell | Light sidebar + header + mobile drawer + sign-out | **New** | — |

## Windows POS (apps/windows-pos, Tauri + React)

| Screen | Status | Data |
| --- | --- | --- |
| Login (server/user/counter) | **Redesigned (light)** — live-verified in browser | Frappe login + `register_device` + `catalog_snapshot` + SQLite |
| Billing | **Redesigned (light)** — live-verified via preview harness (search → cart → totals) | SQLite catalog + domain logic |
| Payment (cash/UPI/card, split, change) | **Redesigned (light)** — live-verified via preview harness | local save + `submit_pos_sale` |
| Sale confirmation / reprint | **Redesigned (light)** — live-verified via preview harness | sync record |
| Sync & review | **Redesigned (light)**; visual via component tests + styles (state data needs a synced counter) | SQLite |
| Preview harness `preview.html` | **New** — explicitly identified demo mode for design QA | fixtures |

## ERPNext Desk (unchanged, canonical)

Purchasing, suppliers, customers, accounting/GST reports, stock reconciliation, users & permissions — provided by ERPNext v16 Desk; the custom console intentionally links out rather than duplicating them.

## Not implemented (no backend; see KNOWN_UI_GAPS.md)

POS shifts UI, returns/exchanges UI, label printing UI, voice UI, mobile transaction creation.
