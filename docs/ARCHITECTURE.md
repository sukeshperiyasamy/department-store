# Architecture

Canonical docs:
- [docs/api-contracts.md](api-contracts.md)
- [docs/architecture-decisions.md](architecture-decisions.md)
- [docs/offline-sync-policy.md](offline-sync-policy.md)
- [docs/ui-ux/DESIGN_SYSTEM.md](ui-ux/DESIGN_SYSTEM.md)
- Module map: [HANDOFF.md §3](../../HANDOFF.md)

## Code-intelligence map (Graphify)

`graphify-out/graph.json` (gitignored; regenerated with `graphify . --code-only`, refresh with
`graphify update .`) holds the machine-readable architecture graph: 1005 nodes / 1951 links /
76 communities, built at commit a83d9494 (verify `built_at_commit` vs HEAD before use).

- Hub nodes: `PosStore` (33 edges), `SyncRecord` (27), `FrappeClient` (24), `AppServices` (18),
  `SaleReviewError`/`SaleResponse` (17) — the persistence, sync-contract and transport cores.
- Relations: contains 649 · calls 480 · imports 260 · imports_from 203 · method 150 · references 79.
- Note: `tests/integration/multi_counter.ts` instantiates `FrappeClient` and `PosStore` directly.
- Query via `graphify path "A" "B"` / `graphify explain "X"`; full LLM/doc mode intentionally
  unconfigured (no API key). Human report: `graphify-out/GRAPH_REPORT.md`.
