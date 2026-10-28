# Local Test Account Guide & Role-Based Navigation Instructions

**Product:** Department Store ERP / Multi-Tenant SaaS Platform  
**Repository Path:** `c:\Users\COMPUTER\Downloads\sukesh\departmental`  
**Git Commit SHA:** `653d8135a1efc20c212175cbe3f3ebca7ea02648` (`main`)  
**Execution Date:** October 28, 2026  
**Auditor:** DevOps & Security Auditor  

> [!IMPORTANT]
> **Credential Security Notice:**  
> In accordance with repository security policies, plaintext passwords and API keys are **never** committed to version control. All generated temporary credentials for the local environment are recorded exclusively in the gitignored file:  
> [`LOCAL_TEST_LOGIN_HANDOFF.md`](file:///c:/Users/COMPUTER/Downloads/sukesh/departmental/LOCAL_TEST_LOGIN_HANDOFF.md)

---

## 1. Verified Local Roles & Responsibilities

The local environment is configured with three distinct, verified personas matching the operational architecture:

### A. Platform Administrator (`Administrator`)
- **Primary Interface:** ERPNext Desk ([http://localhost:8080/app](http://localhost:8080/app))
- **Privileges:** Superuser / System Manager. Full access to DocTypes, Frappe Bench configurations, system logs, role permissions, custom apps, and multi-tenant domain provisioning.
- **Key Desk Workspaces:**
  - `Retail` / `POS Profile`: Configure billing counters, warehouse links, and tender types.
  - `Stock` / `Item`: Master product catalog, barcodes, UOMs, and reorder levels.
  - `Accounts` / `Company`: Chart of accounts, tax templates, and fiscal ledgers.
  - `Users and Permissions`: Role assignments and user provisioning.

### B. Store Manager / Tenant Administrator (`dashboard@demo.store`)
- **Primary Interface:** Owner Dashboard ([http://localhost:3100/login](http://localhost:3100/login)) & ERPNext Desk
- **Assigned Roles:** `Store Manager`, `Accounts Manager`, `Stock Manager`
- **Privileges:** Store-level operations including daily sales analytics, inventory auditing, goods receipt, supplier management, price adjustments, and shift reconciliation.
- **Workflow Steps:**
  1. Navigate to [http://localhost:3100/login](http://localhost:3100/login).
  2. Enter the store manager email and temporary password from `LOCAL_TEST_LOGIN_HANDOFF.md`.
  3. Inspect sales summaries, stock alerts, and cashier shift reports.

### C. Cashier / Billing Counter Operator (`cashier@demo.store`)
- **Primary Interface:** Windows POS Web/Desktop Interface ([http://localhost:1420/](http://localhost:1420/))
- **Assigned Roles:** `Cashier`, `Accounts User`
- **Privileges:** Counter billing, opening and closing cash floats, barcode item scanning, tender selection (Cash, Card, UPI), bill parking/recalling, and offline transaction queuing.
- **POS Shortcuts:**
  - `F3`: Cashier Shift Management (Open / Close shift float modal).
  - `F4`: Tender & Payment Modal.
  - `Enter` / Barcode: Immediate item add to bill.

---

## 2. Default Test Tenant & Seeded Business Data

- **Company Name:** `Demo Departmental Store`
- **Abbreviation:** `DEMO`
- **Default Warehouse:** `Stores - DEMO`
- **In-Transit Warehouse:** `Goods In Transit - DEMO`
- **POS Profile:** `Counter 1` (Device ID: `counter-1`)
- **Currency:** INR (₹)
- **Taxes:** Standard Indian GST Configuration (CGST + SGST / IGST) configured at the ERPNext company level.

---

## 3. How to Safely Reset or Create Test Passwords

If you need to reset passwords or create additional local test users without directly touching MariaDB tables, use Frappe's supported CLI via Docker Compose:

### Reset an Existing Password
```powershell
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml exec backend bench --site frontend set-admin-password <new-password>
```

### Create a New Local Cashier User
```powershell
docker compose -p departmental-erp -f deployment/erpnext/pwd.yml exec backend bench --site frontend execute frappe.core.doctype.user.user.create_user \
  --args "['new_cashier@demo.store', 'Cashier', 'Two']"

docker compose -p departmental-erp -f deployment/erpnext/pwd.yml exec backend bench --site frontend set-password new_cashier@demo.store <new-password>
```

---

## 4. Troubleshooting Local Authentication

1. **Session Expiration / Cookies:**
   - If logging into the desk redirects back to `/login`, clear browser cookies for `localhost` or use a fresh private/incognito window.
2. **CORS / Host Header:**
   - When calling Frappe APIs directly from external tools (Postman, curl), ensure the header `Host: frontend` is provided if connecting via `localhost:8080`.
