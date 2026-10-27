# Commercial Launch Checklist and Governance Specification

## 1. Scope, Legal Notice, and Governance Principles

This document specifies the operational, legal, financial, and customer-success gates required prior to charging live commercial subscription fees to store owners.

> [!CAUTION]
> **Regulatory and Legal Boundary:**
> - Prices and plans listed below reflect proposed platform structures and must receive final sign-off from platform leadership.
> - GST treatment and SaaS subscription invoicing must be formally reviewed and audited by a certified Chartered Accountant (CA) in India.
> - Strictly keep the SaaS provider's subscription invoices separate from each shop's internal retail sales invoices and inventory ledgers.

---

## 2. Customer-Facing Commercial Readiness Checklist

### Gate 1: Subscription Plans & Approved Pricing

| Plan Name | Intended Audience | Monthly Fee (excl. GST) | Max POS Counters | Support Level | Approval Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter** | Small single-counter convenience or grocery store | ₹1,499 / mo | 1 Counter | Standard Email (24h response) | Pending Leadership Approval |
| **Growth** | Busy departmental store with 2–3 billing counters | ₹2,999 / mo | Up to 3 Counters | Priority Phone & WhatsApp (4h response) | Pending Leadership Approval |
| **Enterprise** | Multi-counter supermarket or multi-department mart | ₹4,999 / mo | Up to 6 Counters | Dedicated Account Rep & On-site SLA | Pending Leadership Approval |

- [ ] Final plan pricing approved by corporate officers.
- [ ] 14-day free trial workflow enabled with zero credit-card requirement on sign-up.
- [ ] Annual billing option with 2 months discount (₹14,990/yr for Starter, ₹29,990/yr for Growth) verified.

---

### Gate 2: Subscription Lifecycle, Proration & Suspension State Machine

- [ ] **Trial Expiry Behavior:** Store is placed into read-only mode after 14-day trial unless an active payment method is linked. Data is never deleted upon trial expiration.
- [ ] **Plan Upgrades:** Immediate transition with automated pro-rated billing via payment gateway subscription webhook (`subscription.updated`).
- [ ] **Plan Downgrades:** Applied at the end of the current billing cycle to avoid abrupt counter de-authorizations during business hours.
- [ ] **Payment Failure & Dunning:**
  - Day 1: Automated notification via email & SMS upon card/mandate failure.
  - Day 3 & Day 5: Gateway automatic retries.
  - Day 7: Soft suspension warning banner in Owner Dashboard.
  - Day 10: Grace period expiration; POS counters restricted to offline cached read-only lookup; billing sync paused.
- [ ] **Cancellation:** Customer self-service portal allows cancellation with export of full financial ledgers before tenant archival.

---

### Gate 3: Payment Gateway & Subscription Reconciliation

- [ ] Merchant KYC completed and live API keys provisioned with authorized Indian payment aggregator (Razorpay / Stripe India).
- [ ] e-Mandate / Recurring UPI (NPCI UPI AutoPay) registered and tested for automated monthly collection.
- [ ] Webhook signature verification strictly enforced on `/api/method/departmental_store.api.billing.*` (`X-Razorpay-Signature`).
- [ ] Daily automated reconciliation job compares gateway settlements against `tabSaaS Subscription` records.
- [ ] Chargeback and disputed payment handling SOP documented.

---

### Gate 4: Legal Terms, Privacy Policy & Data Sovereignty

- [ ] **Terms of Service (ToS):**
  - Defines service scope, acceptable use, billing cycles, liability caps, and termination rights.
  - Expressly establishes that the store owner owns **100% of their business data** (customer records, inventory lists, sales history).
- [ ] **Privacy Policy:**
  - Compliant with Digital Personal Data Protection Act (DPDPA 2023) in India.
  - Clear declaration of data processors (hosting provider, email provider, SMS gateway).
  - Explicit commitment: Customer data is never sold, monetized, or shared with third-party advertisers.
- [ ] **Data Retention & Deletion:**
  - Active stores: 7 years retention for statutory GST and audit compliance.
  - Cancelled stores: 90-day grace period for reactivation or data export, followed by permanent cryptographic erasure upon written request.
- [ ] **Data Portability:** Self-service export of all catalogs, customer masters, and general ledger reports in standardized CSV/Excel formats.

---

### Gate 5: Taxation and Compliance (GST Treatment)

- [ ] SaaS subscription billing classified under **SAC Code 997331** (Licensing services for the right to use computer software).
- [ ] GST Rate: **18%** (CGST 9% + SGST 9% for intra-state supply in Tamil Nadu; IGST 18% for inter-state supply across India).
- [ ] Invoicing requirements: B2B subscription invoices issued to store owners with their valid GSTIN, state code, and SAC code.
- [ ] CA confirmation: Verification that platform subscription billing is kept strictly isolated from individual store retail GST returns (GSTR-1 / GSTR-3B).

---

### Gate 6: Service Level Agreements (SLA) & Incident Response

- [ ] **Target Availability:** **99.9% uptime** during store operational hours (06:00 to 23:00 IST).
- [ ] **Planned Maintenance:** Scheduled exclusively between 01:00 and 04:00 IST with minimum 48 hours advance notice in dashboard.
- [ ] **Status Page:** Public status page (`status.departmentstore.in`) providing real-time uptime indicators for Ingress, Database, and POS Synchronization API.
- [ ] **Incident Severity Classification:**
  - **P1 (Critical):** POS billing completely blocked across counters. Target initial response: < 15 minutes; resolution: < 2 hours.
  - **P2 (Major):** Dashboard reporting unavailable or background sync delayed. Response: < 1 hour; resolution: < 8 hours.
  - **P3 (Minor):** Cosmetic UI defects or non-blocking export glitches. Response: < 1 business day.
- [ ] **On-Call Escalation Matrix:** Primary on-call engineer, secondary operations manager, and executive escalation contacts documented.

---

### Gate 7: Customer Support and Onboarding Handover

- [ ] Helpdesk ticketing system active (`support@departmentstore.in`).
- [ ] Knowledge base and video onboarding tutorials published covering:
  - Windows POS counter pairing and token installation.
  - Barcode scanner and receipt printer setup.
  - Daily opening entry and cash reconciliation.
  - End-of-day Z-report generation.
- [ ] WhatsApp Business automated support channel verified.
- [ ] Onboarding checklist verified by platform operations before tenant activation.
