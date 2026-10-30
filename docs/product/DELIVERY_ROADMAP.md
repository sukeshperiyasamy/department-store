# Delivery Roadmap and Definition of Done

## Milestone 0 — Foundation

- Create greenfield workspace beside legacy apps.
- Add strict TypeScript, lint, formatting and CI.
- Add PostgreSQL migrations and seed fixtures.
- Implement auth, store, roles and device registration.
- Establish design tokens and accessible component primitives.

**Exit:** clean install, migration, server start, login and health checks pass.

## Milestone 1 — Vertical slice

- Product/barcode setup
- One complete sale
- SQLite persistence and outbox
- Server idempotency
- Receipt rendering
- Bill lookup

**Exit:** a bill survives restart and network loss; duplicate submission is safe.

## Milestone 2 — Store operations

- Held bills, returns and refunds
- Purchases and receiving
- Batches, expiry and stock count
- Cash sessions, expenses and closing
- Supplier dues and payment reconciliation

**Exit:** owner can run one complete day without a notebook.

## Milestone 3 — Owner leverage

- Today dashboard
- Reports with definitions and drill-down
- PWA approvals and alerts
- Reorder and expiry recommendations
- Backup/restore operations UI

**Exit:** owner can manage the store remotely and resolve exceptions.

## Milestone 4 — Pilot and migration

- Hardware certification
- Staff training
- Data import rehearsal
- Parallel pilot
- Cutover and rollback rehearsal

**Exit:** pilot acceptance and production release gates in
[TESTING_AND_RELEASE_PLAN.md](./TESTING_AND_RELEASE_PLAN.md) pass.

## Definition of done

A feature is done only when:

1. Its user workflow is implemented.
2. Server authorization is enforced.
3. Persistence and migration are covered.
4. Offline/retry behavior is defined where relevant.
5. Audit and privacy behavior is defined.
6. Unit, integration or E2E tests are added.
7. Failure behavior is tested.
8. Documentation and support instructions are updated.
9. The change passes the applicable CI gates.
10. No unrelated legacy data or functionality is removed.
