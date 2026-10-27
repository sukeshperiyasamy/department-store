# Release Process Gap Analysis & Delivery Baseline

## 1. Executive Summary & Baseline State

This document establishes the release governance, continuous integration (CI), and deployment baseline for the **Departmental Store Multi-Tenant SaaS Platform**. The platform architecture comprises:
- **ERPNext/Frappe v16.52.1**: Authoritative central business backend, stock ledger, and accounting kernel.
- **`departmental_store` (Custom Frappe App)**: Offline POS sync endpoint, device authorization, idempotency engine, and SaaS provisioning API.
- **Windows POS (Tauri + React + TypeScript + SQLite)**: Durable offline-first checkout counter application.
- **Owner Dashboard (Next.js 15 App Router + React 18)**: Multi-tenant tenant portal, platform admin console, and subscription center.
- **Mobile Companion (Expo React Native 0.76)**: Owner mobile telemetry, push alerts, and stock inquiry app.
- **`@departmental/shared-types`**: TypeScript schemas, Zod validators, and API v1 contracts.
- **Ingress & Infrastructure**: Traefik reverse proxy with wildcard routing, MariaDB 11.8, Redis 6.2.

### Baseline Metadata
- **Git Branch**: `main`
- **Baseline Commit**: `21996f5` (`feat(scale): scale readiness, performance engineering, and commercial launch (Phase 10)`)
- **Working Tree**: Clean, verified synchronized with `origin/main`
- **Docker Topology**: 9 active healthy containers (`backend`, `db`, `frontend`, `queue-long`, `queue-short`, `redis-cache`, `redis-queue`, `scheduler`, `websocket`)

---

## 2. Existing CI Workflows and Deployment Scripts

### 2.1 Existing Workflows
| Workflow File | Trigger | Scope | Gaps & Limitations |
| :--- | :--- | :--- | :--- |
| [`.github/workflows/windows-release.yml`](file:///.github/workflows/windows-release.yml) | `workflow_dispatch`, Tag `v*` | Packages Windows POS using MSVC, builds NSIS installer, computes SHA256, tests silent install/uninstall, publishes GitHub release. | Only triggers on release tags or manual click. Does **not** run on Pull Requests. Only tests Windows POS; does not test Dashboard, Shared-Types, Mobile, or Frappe. |

### 2.2 Existing Deployment & Ops Scripts
| Script / Config | Location | Role | Gaps & Limitations |
| :--- | :--- | :--- | :--- |
| `pwd.yml` | [`deployment/erpnext/pwd.yml`](file:///deployment/erpnext/pwd.yml) | Docker Compose specification for local/staging ERPNext cluster. | Pinned image tags (`frappe/erpnext:v16.52.1`), but lacks automated rolling update directives. |
| `docker-compose.traefik.yml` | [`deployment/ingress/docker-compose.traefik.yml`](file:///deployment/ingress/docker-compose.traefik.yml) | Ingress reverse proxy with dynamic tenant subdomain routing. | Requires manual wildcard TLS cert generation or ACME DNS provider setup. |
| `run_backup.ps1` / `.sh` | [`deployment/backup/run_backup.ps1`](file:///deployment/backup/run_backup.ps1) | MariaDB database dumps, tarball compression, checksumming, offsite sync. | Standalone script; not tied into pre-migration deployment gates. |

---

## 3. Test Execution Matrix: Local vs. CI

The repository contains extensive automated test suites, but prior to Phase 11, the vast majority only ran locally during development or staging verification.

| Test Suite | Files | Test Count | Local Execution | CI Execution (Current) | Target CI Stage (Phase 11) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Shared-Types Schemas** | `src/*.test.ts` | 75 tests | `npm test -w @departmental/shared-types` | ❌ Not Run | PR Fast Gate |
| **Windows POS Frontend & Domain** | `src/**/*.test.ts(x)` | 80 tests | `npm test -w @departmental/windows-pos` | ✅ Runs in `windows-release` | PR Fast Gate + Release Gate |
| **Owner Dashboard** | `src/**/*.test.ts(x)` | 62 tests | `npm test -w @departmental/owner-dashboard` | ❌ Not Run | PR Fast Gate |
| **Mobile App Isolation** | `src/**/*.test.ts` | 11 tests | `npm test -w @departmental/mobile` | ❌ Not Run | PR Fast Gate |
| **TypeScript Typecheck** | All workspaces | 4 targets | `npm run typecheck` | ✅ Runs in `windows-release` | PR Fast Gate |
| **Frappe Backend Tests** | `test_sales.py`, `test_provisioning_api.py` | 104 tests | `bench --site frontend run-tests` | ❌ Not Run (Requires DB) | Pre-Release / Staging Gate |
| **Pilot Acceptance Suite** | `pilot_acceptance_suite.mjs` | 24 tests | Node test runner against live stack | ❌ Not Run | Staging Integration Gate |
| **Scale & Capacity Suite** | `scale_and_capacity_suite.mjs` | 8 benchmarks | Node test runner against live stack | ❌ Not Run | Pre-Release Benchmark Gate |
| **Ingress & Hardening Checks** | `ingress_routing_check.mjs`, etc. | 18 tests | Live HTTP tests | ❌ Not Run | Staging Post-Deploy Gate |

---

## 4. Component Versioning & Artifact Inventory

| Component | Current Version | Repository Location | Packaging Artifact | Versioning Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Custom Frappe App** | `0.1.0` | [`erpnext-app/departmental_store`](file:///erpnext-app/departmental_store) | Python package / Git repo on bench | SemVer (`MAJOR.MINOR.PATCH`) |
| **Shared API Contracts** | `0.1.0` | [`packages/shared-types`](file:///packages/shared-types) | Monorepo internal workspace | SemVer (Contract breaking = Major) |
| **Windows POS** | `0.1.0` | [`apps/windows-pos`](file:///apps/windows-pos) | NSIS Installer (`*_x64-setup.exe`) | SemVer + Client API Version (`API_V1`) |
| **Owner Dashboard** | `0.1.0` | [`apps/owner-dashboard`](file:///apps/owner-dashboard) | Next.js Standalone Docker Image / Node build | SemVer |
| **Mobile Companion** | `0.1.0` | [`apps/mobile`](file:///apps/mobile) | Expo EAS / APK bundle | SemVer |
| **Docker Images** | `v16.52.1` | Pinned upstream (`frappe/erpnext`) | Prebuilt OCI image | Strictly Pinned |

---

## 5. Identified Release Process Gaps

1. **Gap 1: Missing Pull-Request Quality Gate CI (`ci.yml`)**
   - Developers could push commits directly without PR validation.
   - PRs must execute formatting/linting, typechecking, shared-contract validation, dashboard production build test, and secret scanning before merge.

2. **Gap 2: Multi-Tenant Database Migration Governance**
   - ERPNext stores individual tenant sites (`site_tenant1`, `site_tenant2`). Running an uncoordinated `bench migrate` across all sites simultaneously could cause deadlocks, service interruptions, or cascading failures.
   - An explicit canary migration runner with locking, progress reporting, and immediate halt upon failure is required.

3. **Gap 3: Expand-and-Contract Schema Migration Policy**
   - Changes to Frappe DocTypes or SQLite POS tables must follow the expand-and-contract pattern: backward-compatible fields must be added first; clients updated to handle both old and new formats; obsolete fields deprecated safely.

4. **Gap 4: Client-Server Compatibility & Offline Transaction Queues**
   - Windows POS counters may operate offline during a backend rollout.
   - The backend API must accept payloads from older POS versions (n-1) and reject unsupported versions with human-readable error messages without discarding local SQLite offline outbox queues.

5. **Gap 5: Feature Flag Governance & Suspended Tenant Enforcement**
   - Tenant feature gates must be evaluated on the server side (`frappe.db.get_value("SaaS Tenant")` or cached session claims). Client-side UI toggles are not security boundaries.
   - Suspended tenants must have their sessions invalidated immediately.

6. **Gap 6: Operational Handbook & Maintenance Calendar**
   - Need clear, executable SOPs for release approvals, secret rotation (API keys, JWT secrets, database passwords), certificate renewal, and disaster recovery.

---

## 6. Phase 11 Implementation Roadmap

- **Phase 1**: Implement comprehensive GitHub Actions CI Quality Gate [`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml).
- **Phase 2**: Document versioning strategy, build provenance, and artifact generation in [`docs/release/VERSIONING_AND_RELEASE_ARTIFACTS.md`](file:///docs/release/VERSIONING_AND_RELEASE_ARTIFACTS.md).
- **Phase 3**: Implement safe migration governance and build automated tenant canary runner [`scripts/tenant_migration_runner.py`](file:///scripts/tenant_migration_runner.py).
- **Phase 4**: Document deployment orchestration, staging smoke tests, and rollback procedures in [`docs/release/DEPLOYMENT_ORCHESTRATION_AND_ROLLOUT.md`](file:///docs/release/DEPLOYMENT_ORCHESTRATION_AND_ROLLOUT.md).
- **Phase 5**: Establish client-server compatibility matrix in [`docs/release/CLIENT_SERVER_COMPATIBILITY_MATRIX.md`](file:///docs/release/CLIENT_SERVER_COMPATIBILITY_MATRIX.md).
- **Phase 6**: Define feature flag governance in [`docs/release/FEATURE_FLAG_GOVERNANCE.md`](file:///docs/release/FEATURE_FLAG_GOVERNANCE.md).
- **Phase 7 & 8**: Create operations handbook, maintenance calendar, and audit trail specifications.
- **Phase 9**: Build and execute release simulation test suite [`tests/integration/release_simulation_suite.mjs`](file:///tests/integration/release_simulation_suite.mjs).
- **Phase 10 & 11**: Release Readiness Scorecard, commit verification, and final delivery report.
