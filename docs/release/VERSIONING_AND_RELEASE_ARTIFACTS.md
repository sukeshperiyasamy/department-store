# Versioning Strategy and Release Artifacts

## 1. Multi-Component Versioning Strategy

The Departmental Store SaaS is composed of independently versioned components that share a unified contract layer. All components adhere to [Semantic Versioning 2.0.0](https://semver.org/) (`MAJOR.MINOR.PATCH`).

```
+---------------------------------------------------------------------------------------------------------+
|                                    SHARED API CONTRACTS (SemVer)                                        |
|                                    @departmental/shared-types                                           |
+------------------------------------+------------------------------------+-------------------------------+
                                     |                                    |
                                     v                                    v
+------------------------------------+------------------------------------+-------------------------------+
| SERVER-SIDE (Cloud/Self-Hosted)    | CLIENT-SIDE (POS Desktop)          | WEB / MOBILE PORTALS          |
| departmental_store (Frappe App)    | @departmental/windows-pos (Tauri)   | @departmental/owner-dashboard |
| - Frappe DocTypes & APIs           | - Local SQLite & Outbox Engine     | - Next.js Server Components   |
| - Tenant Provisioning Kernel       | - Hardware Drivers (ESC/POS)       | @departmental/mobile          |
+------------------------------------+------------------------------------+-------------------------------+
```

### 1.1 Component Breakdown & Versioning Rules

| Component | Repository Path | Packaging Artifact | Versioning Rule & Impact |
| :--- | :--- | :--- | :--- |
| **Shared Contracts** | [`packages/shared-types`](file:///packages/shared-types) | TypeScript Source / npm package | **MAJOR**: Removal or incompatible type changes of API fields.<br>**MINOR**: Additive non-breaking schema fields.<br>**PATCH**: Validator tightening or type refinements. |
| **Custom Frappe App** | [`erpnext-app/departmental_store`](file:///erpnext-app/departmental_store) | Python App / Frappe Bench Module | **MAJOR**: Destructive DocType changes requiring data migration.<br>**MINOR**: New DocTypes, backward-compatible fields, new API endpoints.<br>**PATCH**: Logic fixes, performance improvements. |
| **Windows POS** | [`apps/windows-pos`](file:///apps/windows-pos) | Signed NSIS Installer (`*_x64-setup.exe`) | **MAJOR**: Redesigned UI architecture or incompatible SQLite schema.<br>**MINOR**: New cashier features, barcode symbologies, offline search.<br>**PATCH**: Driver/bug fixes. Must declare supported `API_VERSION`. |
| **Owner Dashboard** | [`apps/owner-dashboard`](file:///apps/owner-dashboard) | Next.js Standalone Build / OCI Image | **MAJOR**: Framework major upgrades or structural redesign.<br>**MINOR**: New analytics modules, settings panels, reports.<br>**PATCH**: UI polish, accessibility, styling. |
| **Mobile Companion** | [`apps/mobile`](file:///apps/mobile) | Android APK / iOS Bundle / Expo EAS | **MAJOR**: Native dependency upgrades or auth protocol changes.<br>**MINOR**: New widgets, push alerts, offline product lookup.<br>**PATCH**: Bug fixes. |
| **Deployment Configs** | [`deployment/`](file:///deployment) | Docker Compose & Traefik Configs | Git Tagged with application release tags. |

---

## 2. Release Provenance & Manifest Specification

Every production release artifact must be accompanied by an immutable **Release Manifest** recording exact provenance, cryptographic checksums, and operational constraints.

### 2.1 Release Manifest Schema (`release-manifest.json`)

```json
{
  "release_id": "rel-20261027-v1.0.0",
  "version": "1.0.0",
  "git": {
    "commit_hash": "21996f5b72186843ba090123456789abcdef0123",
    "branch": "main",
    "tag": "v1.0.0"
  },
  "build": {
    "build_number": 482,
    "built_at": "2026-10-27T18:00:00Z",
    "builder": "github-actions-msvc-runner",
    "node_version": "20.18.0",
    "python_version": "3.11.9",
    "rust_version": "1.82.0"
  },
  "artifacts": [
    {
      "name": "Department Store POS-1.0.0-x64-setup.exe",
      "type": "nsis_installer",
      "target_os": "windows-x64",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "signed": true,
      "signature_digest": "sha256"
    },
    {
      "name": "departmental-dashboard-v1.0.0.tar.gz",
      "type": "nextjs_standalone",
      "sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4"
    }
  ],
  "compatibility": {
    "supported_api_version": "v1",
    "min_supported_pos_client": "0.1.0",
    "recommended_pos_client": "1.0.0",
    "min_frappe_version": "16.52.0"
  },
  "migrations": {
    "database_migration_required": false,
    "requires_pre_migration_backup": true,
    "estimated_downtime_seconds": 0
  },
  "known_limitations": [
    "Thermal printing requires USB ESC/POS driver installation on Windows POS terminal.",
    "Offline billing supports up to 5,000 cached SKU records per counter."
  ],
  "rollback_procedure": "Roll back Docker image to previous release tag; re-install previous signed NSIS executable on counters. No schema rollback required for non-breaking additions."
}
```

---

## 3. Strict Zero-Secret Client Artifact Policy

Client applications (Windows POS, Next.js frontend chunks, and Mobile apps) run in untrusted or distributed environments. The following constraints are enforced:

1. **No Embedded Master Secrets**:
   - `FRAPPE_API_SECRET`, `JWT_SECRET`, database passwords (`MYSQL_ROOT_PASSWORD`), and Razorpay live key secrets are **never** bundled into client code.
2. **Environment Variable Segregation**:
   - In Next.js, only variables explicitly prefixed with `NEXT_PUBLIC_` are exposed to client JavaScript. All tenant administration logic and payment signing execute exclusively in Server Actions or API routes.
3. **Windows POS Terminal Identity**:
   - The Windows POS stores its device registration token securely in local SQLite with restricted OS filesystem permissions (`%LOCALAPPDATA%`). It never holds server-level administrator credentials.
4. **CI Secret Scan Preflight**:
   - Pull-request CI fails if high-entropy strings or private key headers are discovered in compiled bundles or code.
