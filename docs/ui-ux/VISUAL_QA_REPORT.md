# Visual QA Report

Method: the running apps were inspected in a real browser (ZCode in-app browser) at the mandated viewport classes; screenshots were captured from actual rendered pages and saved under `docs/ui-ux/screenshots/`. The POS core screens were exercised through the explicitly identified preview harness (`preview.html`), including a complete sale interaction (search → cart → charge → change → committed).

## Screenshots captured (all from live renders)

| File | What it shows |
| --- | --- |
| `dashboard-1920x1080.png` | Dashboard on the day the screenshots were taken (2026-10-27): zero-bill day rendered honestly with empty states; review-queue KPI at 112 from QA test data |
| `dashboard-1920x1080-dated.png` | Dashboard filtered to a business date with sales |
| `dashboard-1366x768.png` | Laptop viewport |
| `dashboard-390x844.png` | Mobile: hamburger nav, stacked KPIs, no horizontal overflow |
| `catalog-1920x1080.png` | Catalog page: 330 items, search, prices/barcodes |
| `sales-1920x1080.png` | Sales list with badges + KPIs |
| `inventory-1920x1080.png` | Stock alerts (out-of-stock/low/expiry) |
| `sync-1920x1080.png` | Counters, review queue, ERP version |
| `login-1920x1080.png` | Console sign-in card |
| `pos-login-1280x860.png` | POS login (light theme, verified after boot-bug fix) |
| `pos-billing-preview-1280x860.png` | POS billing screen (empty cart) |
| `pos-billing-cart-preview-1280x860.png` | Billing with 2 items, ₹549.00 total |
| `pos-payment-preview-1280x860.png` | Payment modal: ₹600 tendered, change ₹51.00 |
| `pos-receipt-preview-1280x860.png` | Sale committed: invoice + change due, cart cleared |

## Checks performed per screen

- Light-theme compliance (no dark surfaces) — PASS everywhere.
- Horizontal overflow at 320–390px — none observed on dashboard/mobile; POS billing is a desktop layout that stacks ≤980px (counter min window 1024px).
- Navigation reaches the correct screens; active nav state tracks the route — PASS.
- Empty/error states: dashboard zero-data day, catalog search miss, sync "never synced" counter, inventory "nothing below reorder" — all render designed empty states, PASS.
- Charts render on white canvas with light tooltips — PASS.
- Contrast: text tokens per DESIGN_SYSTEM.md — PASS (spot-checked).
- Interactive QA: catalog search, POS barcode search, add-to-cart, qty display, charge modal, cash tendered → live change calc, complete sale → committed dialog — PASS (preview harness).

## Defects found during visual QA (fixed)

1. **UI-0001 (High):** POS app could never render — `PosContext.Provider` passed `null` until services existed while `usePos()` threw on null (boot crash). Fixed: provider always supplies context; `useServices()` accessor for screens that require wired services. Regression test: `App.render.test.tsx`.
2. **UI-0002 (High):** `Shell` was not exported from `App.tsx` — the shell component could never be imported/rendered (latent since creation; surfaced by the preview harness). Fixed.
3. Dashboard "ERP authorization failed" during QA — traced to per-suite token rotation plus an ERPNext REST 403 for the reporting user; replaced the REST call with the whitelisted `recent_invoices` method (architecture-compliant) — PASS.

## Remaining visual limitations

- Windows display-scaling checks (100/125/150%) require the compiled Tauri shell — BLOCKED (no Rust toolchain).
- POS sync/review screen with real pending data needs a counter that has queued transactions — component-tested; screenshot from preview shows the shell only.
- Dashboard loading skeletons render only during navigation (server components resolve quickly locally); not captured in a screenshot.
