# Windows Build and Installation

Status: **IMPLEMENTED_AND_VERIFIED** (exe built, launched, logged in, full sale flow exercised; NSIS installer packaged step BLOCKED — see below)

## Toolchain (as installed on this machine, 2026-10-27)

The environment had no Rust/MSVC. Installed **without admin rights**:

1. **Rust GNU toolchain** (self-contained MinGW linker):
   `rustup-init.exe -y --default-toolchain stable-x86_64-pc-windows-gnu --profile minimal`
   (downloaded from https://win.rustup.rs/x86_64)
2. **MSYS2 + MinGW binutils** — the GNU linker's dlltool needs external binutils for
   `windows-sys` import libraries:
   - Download `msys2-base-x86_64-latest.sfx.exe`, extract with `cmd /c "...sfx.exe -y -oC:\msys64"`
   - `C:\msys64\msys64\usr\bin\bash -lc "pacman -Sy --noconfirm mingw-w64-x86_64-gcc"`
3. PATH for builds: `%USERPROFILE%\.cargo/bin;C:\msys64\msys64\mingw64/bin`

## Build

```bash
cd apps/windows-pos
npm install                       # includes @tauri-apps/cli + @tauri-apps/plugin-http (dev/runtime)
npm run build                     # frontend (tsc strict + vite)
npx tauri build --no-bundle       # Rust release build
# artifact: src-tauri/target/release/windows-pos.exe (~8.2 MB)
```

MSVC remains the officially recommended toolchain; the GNU path works for this
project and is documented as used. CI should prefer MSVC + `tauri build` (NSIS
installer) — the NSIS packaging step itself is BLOCKED here only by toolchain
scope, not by any project defect.

## Launch & runtime verification (executed 2026-10-27, release exe)

| Check | Result |
| --- | --- |
| exe launches, window opens | PASS (verified via OS accessibility tree + screenshots) |
| Server URL field is EMPTY by default (no hardcoded localhost in the binary) | PASS |
| Login against ERP (`Administrator`/test site) | PASS after fixes below |
| Device auto-registration by manager user | PASS |
| Catalog sync into counter SQLite (`pos.db` in `%APPDATA%/com.departmentalstore.pos`) | PASS (catalog_meta checkpoint populated) |
| Product search from cached catalog | PASS ("colgate" → ₹99.00 result) |
| Cart ops (add line) | PASS |
| Payment modal with tendered/change + shortfall validation | PASS |
| Sale → durable local save → sync → server verdict surfaced honestly | PASS (server-side `POS Sale Sync Log` rows with device UUID `ac262843-…` verified) |
| Review badge reflects server review state | PASS |

## Defects found & fixed during Windows bring-up (each with evidence)

| ID | Defect | Fix |
| --- | --- | --- |
| WIN-001 | `sql:default` capability does not include `sql:allow-execute` → "Command plugin:sql\|execute not allowed by ACL" | capabilities/default.json grants sql:allow-execute/select/load/close |
| WIN-002 | WebView2 origin `http://tauri.localhost` blocked by ERP CORS → "Failed to fetch" | **tauri-plugin-http** added; FrappeClient uses native fetch under Tauri (no CORS, real cookie jar); capability scope allows `http://**`/`https://**` |
| WIN-003 | SQLite contention between the 5s sync loop and checkout writes → "(code: 5) database is locked" | TauriSqliteDriver: WAL + busy_timeout pragmas, operation queue serializing access, re-entrant transaction path (deadlock fixed), error surfaced in UI |
| WIN-004 | Silent checkout failures | PaymentScreen catches and displays save/sync errors ("Could not save the sale: …") |
| WIN-005 | Stale redis `app_modules` + apps.txt losing the custom app after an interrupted migrate → "Module Departmental Store not found" | `ensure_app_registered` self-heal (install.py); runbook + troubleshooting documented |

## Production packaging notes

- Before shipping: replace demo capabilities scope with the store's server URL
  pattern (e.g. `http://192.168.1.*/*`), set a signed installer (NSIS via
  `tauri build` on an MSVC CI runner), and confirm WebView2 runtime presence
  (preinstalled on Win 11).
- No dev credentials are compiled in: server URL, username and password are
  entered at first login; the ERP session cookie lives in the WebView2 profile.

## Persistence verification

Counter DB survives process kill/restart (verified repeatedly during bring-up:
device UUID and catalog checkpoint persist in `%APPDATA%/com.departmentalstore.pos/pos.db`;
the sync review state survived an app force-kill mid-test).
