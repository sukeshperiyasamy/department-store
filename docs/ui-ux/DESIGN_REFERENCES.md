# Design References Reviewed

References actually consulted during this redesign (existing codebase + prior in-repo research; external browsing was not needed for the decisions below):

| Reference | What was taken | What was deliberately not taken |
| --- | --- | --- |
| **shadcn/ui** (patterns, MIT) | Token-variable approach, restrained card/table/badge vocabulary, "copy-in components" philosophy — the dashboard components are hand-rolled in the same spirit without adding Radix/Tailwind dependencies | Did not adopt Tailwind or Radix wholesale: the existing stack is plain CSS + React with zero UI deps; adding a component framework mid-project would churn working code for no functional gain |
| **Recharts** (already a dependency, MIT) | Pie/bar composition, `contentStyle` theming for light tooltips, `Legend`/axis styling | No new chart types beyond what data supports |
| **Radix UI** (accessibility patterns, MIT) | Dialog focus/ESC semantics already implemented natively in the POS; documented as the pattern to follow if dialogs grow more complex | No install — current dialogs are simple and accessible |
| **TanStack Table/Query** | Acknowledged for future data-heavy grids; current tables are small (≤100 rows server-paged) so plain tables remain adequate | Not installed — no virtualization need demonstrated yet |
| **Tauri docs** | Window sizing (`minWidth` 1024) already set; viewport strategies documented for desktop scaling | — |
| **ERPNext/Frappe Desk** | The Desk remains the canonical UI for purchasing/suppliers/accounting; the custom console deliberately does NOT duplicate those modules | — |

## Decisions

1. **No new runtime dependencies.** The redesign is pure CSS tokens + component refactor — zero npm additions for UI. (`@vitest/coverage-v8` added earlier in QA is test-only.)
2. **Same tokens in both apps**, separate stylesheets (POS is a distinct Vite app; Next.js app-router styles are separate) with identical variable names — no shared package needed for two stylesheets, and it avoids a build dependency.
3. **Light theme by default everywhere**, including the POS (previous POS theme was dark; fully replaced).
4. **Preview harness instead of mocks in the product path**: `apps/windows-pos/preview.html` is the explicitly identified demo mode for design QA.
