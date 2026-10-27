# CI Quality Gates and Verification Catalog

## 1. Quality Gate Architecture Overview

The Departmental Store SaaS enforces a tiered quality verification strategy to ensure that all changes merged to `main` and all production releases are verified, backward compatible, and safe for existing customer databases.

```
+-----------------------------------------------------------------------------------+
| Tier 1: Automated Pull-Request CI Gates (.github/workflows/ci.yml)               |
| - Secret scanning & sensitive key check                                           |
| - Deployment config & container image tag check                                   |
| - TypeScript strict typechecking (all workspaces)                                 |
| - Shared API contract validation (Zod schemas)                                    |
| - Next.js Owner Dashboard build & unit/middleware tests                           |
| - Windows POS frontend build & unit/outbox/durability tests                       |
| - Mobile companion isolation tests                                                |
| - Frappe Python quality (ruff linting)                                            |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Tier 2: Pre-Release & Staging Integration Gates (Local & Staging Runner)          |
| - Frappe Backend Integration Suite (104 tests on isolated MariaDB bench)          |
| - Tenant isolation & hostname routing verification (7 tests)                      |
| - Provisioning pipeline & worker concurrency tests (14 tests)                     |
| - Pilot Customer Journey Acceptance Suite (24 checks)                             |
| - Scale & High-Concurrency Saturation Benchmarks (8 benchmarks)                   |
| - Multi-tenant canary migration runner (scripts/tenant_migration_runner.py)       |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Tier 3: Production Release Packaging (.github/workflows/windows-release.yml)      |
| - Windows POS MSVC compilation + Tauri bundling                                   |
| - NSIS setup installer creation + SHA256 checksum generation                      |
| - Code signing (via Digicert timestamp & PFX secret if configured)                |
| - Silent installation and uninstallation sanity check                             |
| - GitHub release publication with immutable asset hashes                          |
+-----------------------------------------------------------------------------------+
```

---

## 2. Automated PR CI Gates

These checks run automatically on every Pull Request targeting `main` or `develop`, as well as on every direct push.

| Check | Tool / Command | Enforcement Goal | Failure Action |
| :--- | :--- | :--- | :--- |
| **Secret Scanning** | `python scripts/ci/secret_scan.py` | Detect accidental commits of private keys, live Razorpay/Stripe keys, AWS credentials, or hardcoded passwords. | Blocks PR immediately. |
| **Deployment Configs** | `python scripts/ci/validate_deployment_configs.py` | Validate compose syntax; ensure all images use pinned SemVer tags (no `:latest`). | Blocks PR immediately. |
| **Type Integrity** | `npm run typecheck` | Strict TypeScript validation across `shared-types`, `owner-dashboard`, `windows-pos`, and `mobile`. | Blocks PR immediately. |
| **Shared Contracts** | `npm test -w @departmental/shared-types` | Verify Zod schema validation rules, boundary constraints, and backward compatibility. | Blocks PR immediately. |
| **Dashboard Build** | `npm run build -w @departmental/owner-dashboard` | Compile Next.js production build, verify static page generation, server actions, and middleware bundle. | Blocks PR immediately. |
| **Windows POS Tests** | `npm run test -w @departmental/windows-pos` | Verify SQLite durability, offline outbox queuing, idempotency headers, receipt formatting, and cart calculations. | Blocks PR immediately. |
| **Mobile Isolation** | `npm run test -w @departmental/mobile` | Validate mobile secure store isolation, multi-tenant switching, and auth header safety. | Blocks PR immediately. |
| **Python Quality** | `ruff check departmental_store` | Code style, syntax errors, and deprecated Python conventions in Frappe app. | Blocks PR immediately. |

---

## 3. Catalog of Tests Requiring Live or Staging Infrastructure

Certain integration tests cannot run inside a lightweight GitHub Actions runner because they require dedicated multi-container ERPNext instances, MariaDB, Redis, hardware peripherals, or merchant credentials.

| Category | Suite / Check | Reason Cannot Run in Standard PR CI | Verification Stage & Environment |
| :--- | :--- | :--- | :--- |
| **Frappe Backend Core** | `bench --site <site> run-tests --app departmental_store` (104 tests) | Requires MariaDB 11.8 with InnoDB initialized, Redis queue/cache, Frappe bench process, and site database schemas. | Staging Pre-Deployment Runner / Docker Stack |
| **Tenant Isolation & Hostname Routing** | `TestTenantIsolation` & `ingress_routing_check.mjs` | Requires Traefik reverse proxy listening on port 80/443, wildcard DNS or local host resolution (`*.departmental.local`). | Staging Docker Environment |
| **Provisioning Concurrency** | `TestProvisioningApi` & `onboarding_operations_check.mjs` | Involves MariaDB record locking, job queuing in `tabSaaS Provisioning Job`, and multi-site bench operations. | Staging Preflight |
| **Multi-Counter Race & Deadlock** | `tests/integration/multi_counter.ts` & scale suite | Spawns multiple concurrent billing threads hitting `tabSeries` and stock ledgers simultaneously. | Performance Benchmark Staging Cluster |
| **Live Payment Webhooks** | `TestBillingApi` | Webhook signature verification tests run locally with mock secrets; live Razorpay/Stripe webhooks require external ingress endpoint. | Pre-Production Sandbox Testing |
| **Thermal Printer & Barcode Hardware** | ESC/POS USB / Network tests | Requires physical USB thermal printer (`vendorId/productId`), raw ESC/POS cut commands, and serial scanner. | Local Counter QA Bench with Physical Hardware |

---

## 4. Security Rules & CI Permissions

1. **Least Privilege**: All GitHub Actions workflows explicitly declare `permissions: contents: read` (except release workflows which require `contents: write` to publish release tags).
2. **Untrusted PR Protection**: Secret credentials (signing certs, API keys) are never injected into pull request contexts from forks.
3. **Non-Destructive Validation**: Integration tests must never execute against production databases or live tenant sites. Test sites must be explicitly prefixed with `test_` or run on dedicated ephemeral MariaDB containers.
4. **Diagnostic Preservation**: On build or test failure, log artifacts are retained for 14-30 days without logging API keys or bearer tokens.
