# Deployment Guide

## Repository layout

```
deployment/erpnext/pwd.yml      official frappe_docker compose stack
erpnext-app/departmental_store  custom Frappe app (server APIs + DocTypes)
apps/windows-pos                Tauri + React POS (frontend builds; Rust shell needs toolchain)
apps/owner-dashboard            Next.js owner dashboard
packages/shared-types           zod API contracts shared by both apps
```

## 1. ERP server (store backend)

On a Linux server (recommended: Ubuntu LTS) or a dev Windows box with Docker:

```bash
docker compose -f deployment/erpnext/pwd.yml -p departmental-erp up -d
# first boot creates the site "frontend" (ERPNext v16) — takes several minutes
# ERP web UI/API: http://<server>:8080   (admin password set in pwd.yml create-site)
```

Install the custom app (inside the backend container):

```bash
# copy erpnext-app/departmental_store into the container (or use bench get-app <git-url>)
bench get-app /path/to/departmental_store
bench --site frontend install-app departmental_store   # creates roles, custom field, language fix
bench --site frontend execute departmental_store.seeds.demo --kwargs "{'run': True}"   # demo data (dev only!)
```

For production:
- Change ALL default passwords before exposing anything; keep MariaDB
  unreachable from any network except the compose network (it is not published).
- Run behind HTTPS (reverse proxy) and a VPN/tunnel (Tailscale/Cloudflare) for
  remote dashboard access — never expose 8080 or 3306 directly to the internet.
- Set a proper language/company/tax configuration; validate GST setup with a
  qualified accountant before real invoicing.

## 2. Custom app tests

```bash
bench --site frontend set-config allow_tests true   # once
bench --site frontend run-tests --app departmental_store
```

Current status: 11/11 passing (idempotency, price enforcement, review paths,
stock movement, GL posting, change calculation, recovery endpoint).

## 3. Windows POS

Frontend (verified on this machine):

```bash
npm install
npm run test:pos        # 69 tests incl. real-SQLite persistence guarantees
npm run build -w @departmental/windows-pos   # tsc strict + vite production build
```

Desktop shell (requires Rust + MSVC Build Tools — not installed on this
machine; see known-limitations.md):

```bash
cd apps/windows-pos/src-tauri
cargo tauri dev     # development with hot reload
cargo tauri build   # NSIS installer
```

Counter configuration: first login asks for server URL, user, password and a
counter name; a device UUID is generated and stored in the local SQLite DB and
registered on the server (manager-approved device list). Catalog syncs on login
and can be refreshed; sales queue locally whenever the server is unreachable.

## 4. Owner dashboard

```bash
npm run build -w @departmental/owner-dashboard
ERP_BASE_URL=http://<erp>:8080 \
DASHBOARD_API_KEY=<key> DASHBOARD_API_SECRET=<secret> \
npm start -w @departmental/owner-dashboard     # http://localhost:3100
```

Create the service user with least-privilege roles (verified command):

```bash
bench --site frontend execute departmental_store.seeds.make_dashboard_user
# returns {"api_key": "...", "api_secret": "..."} → put into dashboard env
```

Verified end-to-end on this machine: dashboard rendered ₹1,029 gross sales,
3 bills, avg ₹343, counter health, and a clear review queue from live ERP data.

## 5. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| ERP_BASE_URL | owner-dashboard | ERP API base URL |
| DASHBOARD_API_KEY/SECRET | owner-dashboard | service token (optional; else session login) |

No secrets are committed. POS stores no API secrets; it uses the logged-in
user's session cookie inside the Tauri webview.

## 6. Backups (required before go-live)

ERPNext: `bench --site frontend backup --with-files`; schedule via the
scheduler container + cron; encrypt and copy offsite (rclone to a private
bucket). Counter SQLite: copy `AppData` database file while the app is closed
(WAL mode); or add filesystem snapshots. **Restore must be rehearsed
quarterly** — see docs/backup-and-restore.md runbook.
