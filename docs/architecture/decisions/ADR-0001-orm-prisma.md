# ADR-0001: ORM — Prisma

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §1

## Decision

Adopt **Prisma** as the ORM for the backend (API + worker).

## Context

The ERP contains financial double-entry queries, row-locked sequence allocation,
recursive ledger walks, and strong tenant isolation requirements. An ORM covers
~90% of access patterns; the remaining 10% needs precise SQL.

## Consequences

- Queries requiring CTEs, window functions, recursive accounts, or explicit
  `FOR UPDATE` locks are written in **parameterized raw SQL**
  (`$queryRaw` / `$executeRaw`) — never string concatenation.
- Raw queries are documented in a `sql/` directory and covered by
  integration tests.
- Tenant scoping is applied via **Prisma Client Extensions** plus PostgreSQL
  RLS (see ADR-0002).
- The Prisma schema lives in `database/`; the generated client is emitted to
  `database/src/generated/client` so both `apps/api` and `apps/worker` import
  a single instance via `@erp/database`.
