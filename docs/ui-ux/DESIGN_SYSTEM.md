# Design System — Departmental Store ERP

One token set, two consumers: the **Manager Console** (Next.js, `apps/owner-dashboard/src/app/globals.css`) and the **Windows POS** (`apps/windows-pos/src/index.css`). Both define the same CSS-variable names with the same values; both are light-theme by default. The POS additionally adapts density/touch-target sizes for counter hardware.

## Color tokens

| Token | Value | Usage |
| --- | --- | --- |
| `--bg` | `#F8FAFC` | App background (never dark) |
| `--card` | `#FFFFFF` | Cards, panels, sidebar, tables |
| `--surface` | `#F1F5F9` | Secondary surfaces, hover, skeleton base |
| `--text` | `#1F2937` | Primary text |
| `--muted` | `#64748B` | Secondary text, labels, metadata |
| `--border` | `#E2E8F0` | All borders/dividers |
| `--accent` / `--accent-hover` | `#0F766E` / `#115E59` | Primary actions, active nav, KPI emphasis |
| `--accent-soft` | `#CCFBF1` | Selected nav tint, success-ish highlight |
| `--accent-2` | `#6366F1` | Secondary highlight (charts, selected states) |
| `--success` / `--success-soft` | `#15803D` / `#DCFCE7` | Positive badges |
| `--warning` / `--warning-soft` | `#B45309` / `#FEF3C7` | Needs-attention badges (sync review, low stock) |
| `--error` / `--error-soft` | `#DC2626` / `#FEE2E2` | Errors, disabled counters, out-of-stock |
| `--info` / `--info-soft` | `#0284C7` / `#E0F2FE` | Informational badges |
| `--chart-1..6` | teal, indigo, amber, sky, red, green | Chart marks on light canvas |

Rules enforced: no dark backgrounds anywhere in the default theme; large dark surfaces prohibited; charts use dark marks on white panels; one restrained accent per screen.

## Typography

System stack (`Segoe UI, system-ui, -apple-system, sans-serif`). Scale: 12 (metadata/labels) · 13 (secondary) · 14 (body/table) · 16 (panel titles/nav) · 20 (page titles) · 26–28 (KPI values). Weights: 400 body, 500–600 emphasis/labels, 700–800 KPI/brand. Tabular numerals for money columns (`font-variant-numeric`).

## Spacing, radii, elevation

Spacing on a 4px rhythm (4/8/12/16/18/22/24/48). Radii: 6 (inputs/buttons), 10 (cards/panels), 14 (modals). Shadows: one subtle card shadow, one elevated modal shadow — nothing else. Focus: `0 0 0 2px #fff, 0 0 0 4px accent` (visible on every interactive element).

## Layout system

- Sidebar 236px fixed ≥901px; below 900px it becomes a slide-over drawer with scrim (hamburger in the header).
- Header 56px sticky; content max-width 1280px centered.
- Grids: KPI `repeat(auto-fit, minmax(200–220px, 1fr))`; two-column panels collapse ≤860px; POS billing is a 380px search pane + fluid cart (stacks ≤980px).
- Viewport classes verified: 2560/1920 (full grid), 1366 (compact), 1024/768 (tablet), 390/844 and 320+ (mobile single column).

## Shared components

Manager Console: `Shell` (sidebar+header+drawer), KPI card, `Badge` (ok/warn/bad/info/accent/neutral), data table (`.data`), toolbar forms, empty state (`.empty`), error banner, skeletons, Recharts light theme (`SalesCharts`), login card.
POS: topbar with sync badge, search pane + results, cart table with qty inputs, totals bar with charge CTA, payment modal (modes/split/change), receipt confirmation dialog, sync/review screen sections, login card.

## States

Every data surface implements: loading (skeletons/`busy` flags), empty (icon + explanation + next action), error (banner with actionable message), offline/pending (sync badge + per-transaction states), permission-denied (backend 403 → login or error banner). Destructive actions require confirmation; double-submission is prevented client-side AND server-side.

## Accessibility

Semantic landmarks (`nav`, `header`, `main`), labelled controls (`aria-label` on icon-only controls), visible focus rings, `aria-current` navigation, WCAG-AA-checked text pairings (e.g. `#1F2937` on `#FFF` = 12.6:1, `#64748B` on `#FFF` = 4.8:1, white on `#0F766E` = 5.4:1), `prefers-reduced-motion` respected, charts have text alternatives (tables + KPI cards carry the same numbers).
