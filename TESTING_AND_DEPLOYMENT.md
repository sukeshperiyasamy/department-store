# TESTING_AND_DEPLOYMENT

Quick reference for running the test suites and deploying/operating the system.
Full details: `docs/testing/TEST_ENVIRONMENT.md`, `docs/deployment.md`,
`docs/operations/BACKUP_AND_DISASTER_RECOVERY.md`, `docs/release/WINDOWS_BUILD_AND_INSTALLATION.md`.

## 1. Test suites (all executed 2026-10-27; statuses in FEATURE_STATUS.md)

| Suite | Command | Latest result |
| --- | --- | --- |
| Bench (ERPNext integration, 30 tests) | `docker compose -f deployment/erpnext/pwd.yml -p departmental-erp exec backend bench --site frontend run-tests --app departmental_store` | 30 PASS |
| TS unit/component (3 workspaces, 86 tests) | `npm run test` | PASS |
| Typecheck (strict, 3 workspaces) | `npm run typecheck` | 0 errors |
| Production builds | `npm run build --workspace @departmental/windows-pos` + `…owner-dashboard` | PASS |
| HTTP integration/security/perf (24 checks) | `node tests/integration/api_suite.mjs` | 23 PASS, 1 FAIL (STOCK-01, open) |
| Multi-counter/offline (9 scenarios) | `npx tsx tests/integration/multi_counter.ts` | 9/9 PASS |
| Reliability (backend restart, exactly-once) | `node tests/integration/reliability_check.mjs` | 4/4 PASS |
| Coverage (POS) | `npx vitest run --coverage` (from apps/windows-pos) | domain 87% / local 80% / transport 78% |
| Secrets/history scan | `git grep` patterns + `git log -- tok.*` | clean; leaked pair rotated dead |

Requirements: Docker stack up; test seeds applied (see `docs/testing/TEST_ENVIRONMENT.md`);
API tokens are generated fresh per run by the suites themselves.

## 2. Deployment

### ERP backend (docker, site `frontend` on :8080)

```bash
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
# inside backend container:
bench --site frontend execute departmental_store.install.ensure_app_registered
bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"   # demo only
```

Production hardening: change default passwords, HTTPS reverse proxy, never expose
8080/3306, register the backup scheduler (§4).

### Windows POS

```bash
cd apps/windows-pos
npm install && npm run build
npx tauri build --no-bundle      # needs rustup-gnu + MSYS2 mingw64 on PATH (no admin)
# artifact: src-tauri/target/release/windows-pos.exe
```

First login: enter server URL + ERP account; the counter auto-registers (manager
credentials) or requires a manager to enable it first (cashier login).

### Manager Console

```bash
npm run build --workspace @departmental/owner-dashboard
ERP_BASE_URL=http://<erp>:8080 DASHBOARD_API_KEY=<k> DASHBOARD_API_SECRET=<s> \
  npm start -w @departmental/owner-dashboard        # :3100
```

Service token: `bench --site frontend execute departmental_store.seeds.make_dashboard_user`
(rotates each call; store in `.env.local`, gitignored).

## 3. Operations

| Task | Command / where |
| --- | --- |
| Backup (dump + files + integrity + retention) | `bash deployment/backup/run_backup.sh` → `%USERPROFILE%\departmental-backups\<stamp>\` |
| Restore rehearsal | scratch site → `bench restore` → verify counts → drop (docs/operations/BACKUP_AND_DISASTER_RECOVERY.md) |
| Feature flags | bench execute `departmental_store.api.settings.get_settings` / `set_flag`; Manager Console settings UI pending |
| Sync incidents | Manager Console → Sync & Health (review queue, backlog); POS Sync screen (retry/reprint) |
| Module-map failures ("Module … not found") | `bench --site frontend execute departmental_store.install.ensure_app_registered` + `clear-cache` + backend restart |

## 4. Known limitations

- STOCK-01 availability mismatch under india_compliance (open — see KNOWN_ISSUES_AND_TODO.md).
- Physical printer/camera hardware unverified. NSIS installer needs MSVC CI.
- Regional catalog seed written but not yet executed on the test site (apps.txt churn).
- e-invoicing/e-waybill disabled pending legal determination; no GSTR validation.
