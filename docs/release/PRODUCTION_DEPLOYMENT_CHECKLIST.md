# Production Deployment Checklist & Configuration Guide

**Project:** Department Store ERP (Single Store, 2–3 Windows Billing Terminals)  
**Status:** Pre-Production Specification (Mandatory for Go-Live)  
**Security Rule:** Never invent real business identifiers or disable statutory GST validation.

---

## 1. Store Legal Entity & Profile Master

Before conducting commercial transactions, replace all demo company defaults in ERPNext:

- [ ] **Company Legal Name:** Configure official legal name registered with the Ministry of Corporate Affairs / Registrar of Firms (in `Company` master).
- [ ] **Trade Name / Receipt Header:** Set store trade name (e.g., as printed on billing receipts and display boards).
- [ ] **Store Operating Address:** Enter real street address, city, district (Southern Tamil Nadu), and postal PIN code.
- [ ] **State & State Code:** Confirm State is set to `Tamil Nadu` (State Code: `33`, Country: `India`).
- [ ] **Base Currency:** Confirm Base Currency is `INR` (₹) with minor units in Paise (100 Paise = ₹1.00).
- [ ] **Timezone Enforcement:** Confirm `System Settings.time_zone` is set to `Asia/Kolkata` (mandatory; verified via `departmental_store.install.ensure_site_timezone`).

---

## 2. Statutory GST & Tax Configuration

Tax calculations are strictly authoritative in central ERPNext via the `india_compliance` app. **Client-side POS code never calculates GST independently.**

- [ ] **Real Store GSTIN:** Obtain the store's official 15-digit GSTIN (starting with `33` for Tamil Nadu) and update:
  - `Company` master (`gstin` field).
  - Primary store `Address` master.
  - POS Invoice / Receipt header templates.
  - *Replace demo placeholder `33AAAAA0000A1Z5`.*
- [ ] **Mandatory GST Validation Guard:** Verify `validate_hsn_code` remains enabled (`1`) in `GST Settings`. **Never disable statutory HSN/GST validation.**
- [ ] **Chartered Accountant Sign-Off:**
  - Certified accountant must inspect all seeded Item Tax Templates (`CGST 9% + SGST 9%` for 18% standard goods; `CGST 2.5% + SGST 2.5%` for 5% provisions; 0% Exempt for unprocessed agricultural staples).
  - Verify every inventory product carries a genuine 6-digit or 8-digit HSN code registered in the `GST HSN Code` DocType.
- [ ] **E-Invoicing / E-Waybill Determination:**
  - Review annual aggregate turnover with store legal counsel.
  - If below the statutory e-invoicing threshold, confirm feature remains disabled.
  - If required by law, configure GSP/NIC API credentials via India Compliance settings.

---

## 3. Users, Credentials & Access Control (Least Privilege)

Eliminate all default credentials and demo accounts before opening store LAN access:

- [ ] **Rotate Root & Administrator Passwords:**
  - MariaDB root password must be rotated from `admin` to a strong 32+ character random secret.
  - Frappe `Administrator` password must be rotated to a secure credential stored in an enterprise password vault.
- [ ] **Create Production Cashier Users:**
  - Create dedicated user accounts for each counter cashier (e.g., `cashier1@store.local`, `cashier2@store.local`).
  - Assign roles: `Cashier` and `Accounts User` ONLY.
  - Verify Cashier accounts **cannot** access owner summary reports, register POS devices, or mutate feature flags.
- [ ] **Create Store Manager User:**
  - Assign roles: `Store Manager` and `Accounts Manager`.
  - Authorized for device registration, supervisor overrides, return authorizations, and inventory adjustments.
- [ ] **Create Owner / Dashboard Service User:**
  - Run `bench --site frontend execute departmental_store.seeds.make_dashboard_user`.
  - Record generated `api_key` and `api_secret` into `/apps/owner-dashboard/.env.local`.
  - Restrict `.env.local` permissions (`chmod 600` / Windows ACL: Administrators only).
- [ ] **Delete / Deactivate Demo Fixtures:**
  - Remove test users (`test_cashier_*`, `test_store_mgr_*`).
  - Clean test transactions from `POS Sale Sync Log` before production opening.

---

## 4. POS Counters & Physical Terminal Registration

- [ ] **Assign Fixed Counter Terminals:**
  - Counter 1 (Main Grocery Billing): Windows 10/11 terminal.
  - Counter 2 (Provisions & Express): Windows 10/11 terminal.
  - Counter 3 (Backup / Customer Service / Returns): Windows terminal.
- [ ] **Initial Manager Registration:**
  - Launch packaged `windows-pos.exe` on Counter 1.
  - Enter production ERP Server URL (e.g., `http://192.168.1.10:8080`).
  - Authenticate using Store Manager credentials to approve terminal device ID.
  - Verify device status transitions to `Enabled` in `POS Device` master.
- [ ] **Local SQLite Durability Verification:**
  - Confirm SQLite database is created at `%APPDATA%\com.departmentalstore.pos\pos.db`.
  - Verify SQLite WAL mode is active (`PRAGMA journal_mode = WAL;`).
- [ ] **Initial Catalog Checkpoint:**
  - Trigger catalog download on POS terminal.
  - Verify product count matches central warehouse master.

---

## 5. Physical Hardware Validation (On Delivery)

- [ ] **Thermal Receipt Printers (ESC/POS):**
  - Connect 58mm / 80mm thermal receipt printer via USB.
  - Verify spool queue directory (`%APPDATA%\departmental-pos\print_queue\`).
  - Test print receipt: verify Tamil/English product names, invoice numbers, GST breakdown, and auto-cut pulse.
  - Verify duplicate reprint marker displays `[DUPLICATE BILL]` on re-prints.
- [ ] **Barcode Sticker & Shelf Label Printers (ZPL / TSPL):**
  - Connect dedicated label printer.
  - Test print 50mm x 25mm barcode label: verify EAN-13 scanning and human-readable text.
- [ ] **Electronic Cash Drawers:**
  - Connect cash drawer RJ11 kick cable to receipt printer.
  - Test kick pulse on cash tender completion.
- [ ] **Barcode Scanners:**
  - Test 1D/2D USB handheld barcode gun with keyboard wedge mode.
  - Verify scan speeds on curved packages and foil pouches.

---

## 6. Host Infrastructure & Backup Automation

- [ ] **Network Isolation:**
  - Bind ERPNext backend and dashboard to private store subnet (e.g. `192.168.1.0/24`).
  - Do NOT publish MariaDB port `3306` to public networks.
  - Set up reverse proxy (Caddy/Nginx) with local TLS certificate for Manager Console.
- [ ] **Automated Daily Backups:**
  - Execute `deployment\backup\schedule_backup.ps1` to register `DepartmentalStore-ERP-Backup` in Windows Task Scheduler.
  - Verify task runs daily at 02:00 AM IST.
  - Verify backup directory `$env:USERPROFILE\departmental-backups\` retains 14 days of backups.
  - Verify each backup contains valid `*-database.sql.gz` and passes `SHA256SUMS.txt` validation.
- [ ] **Off-Site Replication:**
  - Configure automated secondary sync (e.g., encrypted rclone or external hard drive) for disaster recovery.

---

## 7. Go-Live Sign-Off Matrix

| Milestone | Sign-Off Role | Required Evidence | Status |
| :--- | :--- | :--- | :--- |
| **Tax & GST Approval** | Chartered Accountant | Written sign-off on GSTIN, tax templates, HSN codes | PENDING |
| **Physical Hardware** | Store Operations Lead | 10 test receipts and 10 test labels printed and verified | PENDING |
| **Windows Installer** | IT Administrator | Silent NSIS install/upgrade tested on target Windows version | WORKFLOW READY |
| **Backup Automation** | Systems Administrator | Windows Task Scheduler job active; restore rehearsal PASS | VERIFIED (2026-10-27) |
| **Core Billing & Sync** | Engineering Lead | 40 bench tests, 103 TS tests, 24 API tests, 11 multi-counter tests | VERIFIED (2026-10-27) |
