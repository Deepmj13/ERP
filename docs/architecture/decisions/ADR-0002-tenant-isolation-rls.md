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

## Addendum (2026-09-14) — enforcement design as deployed

Applied via migration `20260914010000_rls`.

**Strict `ENABLE ROW LEVEL SECURITY` + `FORCE`** on all business tables:
`roles`, `role_permissions`, `user_roles`, `sessions`, `idempotency_keys`,
`document_sequences`, `audit_logs`, `companies`, `branches`, `tenant_settings`,
`subscriptions` — policy is

```sql
tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
```

`NULLIF(...)::uuid` yields `NULL` when the GUC is unset, so an operation
outside a tenant context affects zero rows (deny, never leak).

**Identity / bootstrap layer is exempt** (no RLS): `users`, `tenants`,
`tenant_users`, `permissions`, `_prisma_migrations`. Rationale:

- `register` must create the very tenant it authenticates into; a `BEFORE
INSERT` trigger on `tenants` (`set_tenant_rls_context`) arms the GUC to the
  new tenant so the scaffold rows (role, role_permissions, sessions, …) pass
  RLS inside the same transaction.
- The JWT guard and login/refresh read `tenant_users`/`users` before any
  request tenant context exists.
- `GET /tenants` legitimately lists the user's memberships across tenants.
- `permissions` is a global catalog (no tenant column).
  Residual exposure from these tables is limited to membership/branding
  metadata for accounts whose credentials are already presented; business
  data is never accessible cross-tenant at the DB layer.

**App-layer GUC arming** (`apps/api`):

- `TenantContextInterceptor` (global, outermost via `APP_INTERCEPTOR`) runs the
  authenticated request inside an `AsyncLocalStorage` tenant context, but it
  executes _after_ guards, so the guards arm the context themselves
  (`JwtAuthGuard`, `PermissionsGuard`).
- `PrismaService` is extended (`$extends`) so every model operation and every
  raw operation (`$queryRaw`/`$executeRaw` + unsafe variants) runs as
  `$transaction([set_config('app.current_tenant_id', …), op])` (array-form,
  single connection) when a tenant context is present; unwrapped otherwise.
- `withTenant(tenantId, fn)` runs `fn` inside an interactive transaction that
  sets the GUC, and marks the async context so extensions don't nest.
- Public auth paths that touch RLS tables (`login`, `refresh`, `logout`,
  `tenants/:id/activate`) route those writes through `withTenant`.
- `GET /tenants` resolves each membership's role names inside that
  membership's own tenant `withTenant` context.

Trade-offs recorded: array-form transactions add a `set_config` round-trip per
operation; interactive transactions use `{ maxWait: 15s, timeout: 30s }` to
absorb Neon cold-start latency; interactive transaction timeouts in short
defaults (5s) caused the initial failures observed before these options were
added.
