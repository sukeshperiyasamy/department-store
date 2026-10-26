# Claude Code Project Instructions

Read `AGENTS.md` first. It contains the repository-wide requirements and non-negotiable architecture constraints.

Before implementing a feature:
1. Identify whether the behavior belongs in ERPNext/Frappe, the Windows POS, local SQLite/sync, or reporting/mobile.
2. Reuse existing ERPNext business models and supported transaction workflows.
3. State assumptions when requirements are ambiguous; do not invent legal, accounting, or invoice-numbering rules.
4. Add tests for the happy path and failure/retry path.
5. Check authorization, audit logging, and offline behavior where relevant.

Never bypass ERPNext business logic with direct database writes. Never claim tests or deployments succeeded without running and verifying them. Keep secrets and production data out of source control.
