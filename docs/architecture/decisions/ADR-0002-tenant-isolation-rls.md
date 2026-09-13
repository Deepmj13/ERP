# ADR-0002: Tenant isolation — RLS + app-layer scoping

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §7, §25

## Decision

Tenant isolation is enforced twice:

1. **App layer (primary):** active tenant is resolved from the authenticated
   session; every query runs through a tenant-scoped Prisma client that sets
   `set_config('app.current_tenant_id', …, true)` **inside the transaction**
   (PgBouncer-safe).
2. **Database layer (backstop):** `ENABLE ROW LEVEL SECURITY` + `FORCE` on every
   tenant-owned table, with a policy comparing `tenant_id` to the session GUC.

## Context

A missed filter or a raw query must never leak rows cross-tenant. RLS makes
the failure mode "no rows returned" instead of "rows returned".

## Consequences

- Every tenant-owned table carries `tenant_id` **as a real column** with an
  index leading on `(tenant_id, …)` — keeps the schema portable for a future
  schema-per-tenant / DB-per-tenant move (plan §7 scale-out path).
- RLS policies are applied as raw SQL steps in migrations (Prisma schema
  cannot express them).
- Cross-tenant tests are mandatory (plan §25): Tenant A must get 403/404 —
  never data — for Tenant B resources, including via raw query paths.
