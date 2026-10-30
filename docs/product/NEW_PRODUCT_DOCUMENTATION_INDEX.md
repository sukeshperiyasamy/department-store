# New Store Platform — Development Documentation

**Status:** Approved product direction / implementation handoff
**Date:** 30 October 2026
**Scope:** Greenfield replacement for the ERPNext-dependent product UX

This document set defines the new store platform. The existing ERPNext-based
application, database and user data remain preserved during development and
migration. Nothing in this set authorizes destructive deletion or a production
cutover.

## Documents

| Document | Purpose |
| --- | --- |
| [NEW_PRODUCT_PRD.md](./NEW_PRODUCT_PRD.md) | Product vision, users, scope, workflows and acceptance criteria |
| [NEW_PRODUCT_ARCHITECTURE.md](./NEW_PRODUCT_ARCHITECTURE.md) | Technology choices, service boundaries and repository shape |
| [DOMAIN_AND_DATA_RULES.md](./DOMAIN_AND_DATA_RULES.md) | Sales, stock, cash, payment, supplier and audit invariants |
| [OFFLINE_SYNC_SPEC.md](./OFFLINE_SYNC_SPEC.md) | Durable local transactions, retry and conflict handling |
| [SECURITY_AND_ACCESSIBILITY.md](./SECURITY_AND_ACCESSIBILITY.md) | Security, privacy, permissions and accessible UX requirements |
| [API_AND_INTEGRATION_SPEC.md](./API_AND_INTEGRATION_SPEC.md) | API conventions, versioning and integration boundaries |
| [TESTING_AND_RELEASE_PLAN.md](./TESTING_AND_RELEASE_PLAN.md) | Test strategy, quality gates and release evidence |
| [MIGRATION_AND_CUTOVER_PLAN.md](./MIGRATION_AND_CUTOVER_PLAN.md) | Safe migration from the current system and rollback plan |
| [DELIVERY_ROADMAP.md](./DELIVERY_ROADMAP.md) | Incremental milestones and definition of done |

## Decision summary

- Product: simple, offline-first departmental-store operating system.
- Windows POS: React + Vite + Tauri 2 + SQLite.
- Owner/admin: React + Vite responsive PWA.
- Backend: Node.js 24 LTS + Fastify modular monolith.
- Database: PostgreSQL; Drizzle migrations plus explicit SQL for ledgers.
- Contracts: REST/OpenAPI and Zod schemas shared by clients and server.
- Deployment: Docker Compose and Caddy on one low-cost server initially.
- AI/ML: optional recommendation layer only; never authoritative for money,
  tax, stock posting or permissions.
- Existing ERPNext: legacy source to migrate from, not the new end-user UX.

## How to use these documents

Every implementation change must identify the relevant requirement or rule,
add a test for new business behavior, and update the applicable document when
the decision changes. A feature is not complete because a screen renders: its
authorization, persistence, retry behavior, audit trail and failure path must
also be verified.
