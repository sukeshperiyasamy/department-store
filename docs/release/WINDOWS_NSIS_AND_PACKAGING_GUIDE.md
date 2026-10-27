# Windows POS Packaging & NSIS Installer Guide

**Target Application:** Windows Desktop POS (`apps/windows-pos`)  
**Technology:** Tauri 2 (Rust shell) + React (TypeScript) + SQLite (offline outbox)  
**Package Target:** Nullsoft Scriptable Install System (NSIS) standalone setup installer (`.exe`)  
**Status:** Workflow Specified and Configured in `.github/workflows/windows-release.yml`

---

## 1. Automated CI Packaging (Recommended)

Building the Windows NSIS installer requires MSVC Build Tools and NSIS (`makensis`), which are standard on GitHub Actions `windows-latest` runners.

### Workflow Trigger
The automated packaging pipeline is defined in [`.github/workflows/windows-release.yml`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/.github/workflows/windows-release.yml):
- **Manual Trigger:** Run from GitHub Actions tab (`workflow_dispatch`).
- **Release Trigger:** Push a version tag:
  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```

### Pipeline Actions
1. Clones repository and sets up Node 20 and Rust MSVC stable (`x86_64-pc-windows-msvc`).
2. Runs TypeScript strict typecheck and POS unit test suite (103 tests).
3. Builds the production web frontend (`npm run build`).
4. Executes `npx tauri build --bundles nsis`.
5. Verifies installer generation (`Department Store POS_0.1.0_x64-setup.exe`) and computes SHA-256 hash.
6. Signs executable if Authenticode certificate secrets are provided.
7. Executes silent test installation (`/S`) and uninstallation in the CI environment.
8. Publishes artifacts and attaches installer to the GitHub Release.

---

## 2. Code Signing & Authenticode Requirements

Windows SmartScreen warns cashiers or technicians if installing an unsigned binary from an external network.

### Certificate Configuration
In production, obtain an Authenticode Code Signing Certificate (EV or standard OV) and configure GitHub repository secrets:
- `WINDOWS_CERTIFICATE_BASE64`: Base-64 encoded `.pfx` certificate file.
- `WINDOWS_CERTIFICATE_PASSWORD`: Password for the private key.

The CI workflow automatically invokes Microsoft SignTool:
```powershell
signtool sign /f cert.pfx /p $env:PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 "Department Store POS_0.1.0_x64-setup.exe"
```

---

## 3. Local Packaging Prerequisites (Windows Workstation)

To build the NSIS installer locally rather than via GitHub Actions:

1. **Install MSVC Build Tools:**
   Install Visual Studio Build Tools with the "Desktop development with C++" workload.
2. **Install NSIS:**
   Install NSIS (version 3.09 or newer) from https://nsis.sourceforge.io/ or via winget:
   ```powershell
   winget install NSIS.NSIS
   ```
   Ensure `makensis.exe` is added to your system `PATH`.
3. **Execute Build:**
   ```powershell
   cd apps/windows-pos
   npm run build
   npx tauri build --bundles nsis
   ```
   Artifacts output to `apps/windows-pos/src-tauri/target/release/bundle/nsis/`.

---

## 4. Installation, Upgrade & Uninstall Lifecycle

### Directory Structure
| Data Layer | Path | Lifecycle Behavior |
| :--- | :--- | :--- |
| **Application Executable** | `%LOCALAPPDATA%\Programs\Department Store POS\` | Overwritten/updated during app upgrades. |
| **Counter SQLite Database** | `%APPDATA%\com.departmentalstore.pos\pos.db` | **PRESERVED** during upgrades and uninstalls. |
| **Spool Queue (Print)** | `%APPDATA%\departmental-pos\print_queue\` | Ephemeral byte files. |
| **Registry Entries** | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.departmentalstore.pos` | Managed by NSIS. |

### Command-Line Arguments
- **Interactive Install:** Double-click `Department Store POS_*_x64-setup.exe`.
- **Silent Install:** `Department Store POS_*_x64-setup.exe /S`
- **Custom Install Path:** `Department Store POS_*_x64-setup.exe /S /D=C:\StorePOS`
- **Silent Uninstall:** `"%LOCALAPPDATA%\Programs\Department Store POS\Uninstall Department Store POS.exe" /S`

### Critical Durability Safeguard
The NSIS uninstaller intentionally **does not delete** `%APPDATA%\com.departmentalstore.pos\pos.db`. This ensures that un-synced offline bills or audit trails can never be destroyed by accidental software uninstallation. Terminal decommissioning requires explicit IT administrator deletion of the app data directory.
