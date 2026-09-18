---
name: erp-saas
description: Use when working on the ERP_SAAS multi-tenant SaaS ERP codebase (NestJS + Prisma + PostgreSQL 16 + RLS + Redis/BullMQ + Flutter monorepo). Covers implementation status, architecture rules, the NestJS module pattern, database + API conventions, document numbering, idempotency, RBAC, ADRs, and how to add/extend ERP modules (Sales, Inventory, Finance, Procurement, HR, Payroll, Operations, SaaS platform). Trigger on files under apps/api, apps/worker, packages/, database/prisma, or when building a new ERP module, migration, permission code,.
---

# ERP_SAAS — Project Guide

Multi-tenant SaaS ERP (order-to-cash and beyond) as one shared product across Flutter web/desktop/mobile. Monorepo managed with npm workspaces. This skill is the working guide for navigating the codebase and making changes that survive review.

## Source-of-truth documents (read before big changes)

- `ERP_Implementation_Plan_V2.md` — the active architecture plan (1,823 lines). V1 is superseded; do not edit V1.
- `future.md` — the living roadmap for Phases 3-9 and cross-cutting gaps (G-1..G-8). A phase section is removed only when fully implemented + verified.
- `docs/architecture/decisions/ADR-*.md` — 6 binding architecture decision records (ORM, tenant isolation RLS, API response contract, RBAC permission codes, sessions/refresh rotation, document numbering). **When changing a domain covered by an ADR, read the ADR first and follow it.**

## Current status map

- Phases 0-2 **DONE**: platform foundation (auth, multi-tenancy RLS, RBAC, organization, audit), CRM customers, master data (products, categories, units, tax rates).
- Phase 3 **Sales** — backend implemented (quotations, orders, deliveries, invoices, payments, bank-accounts). Flutter login/register + API client scaffolded (G-5 committed).
- Phase 4 **Inventory** — backend shipped (warehouses, stock ledger adjustments/transfers/stocktake, batches/serials).
- Phase 5 **Finance** — backend implemented (COA + journal entries, fiscal periods, bank transactions, reports, invoice/payment auto-posting) + migration & seed applied (`prisma migrate deploy` + `db seed` landed against Neon). `finance-flow.e2e-spec.ts` written but **not yet run**.
- Phase 6-9 **NOT STARTED** (Procurement, HR/Payroll, Operations, SaaS).
- Cross-cutting gaps: G-1/G-2/G-3/G-5/G-6 done; G-4 seeds (permissions + COA) done; G-8 permission catalog pending.**

Phase dependency chain (from future.md): Sales → Inventory (deliveries need stock) → Finance (payments/invoices posting) → Procurement → HR → Payroll → Operations → SaaS.

## Repo layout

```
apps/api            NestJS API (routes under /api/v1). THE main application.
apps/api/src/<module>   per-feature: <module>.controller.ts + <module>.service.ts + DTO classes
apps/api/src/common      guards, interceptors, decorators, filters, database (numbering), rls/
apps/api/src/jobs        BullMQ producers + dead-letter service (queues: pdf, email; DLQs: pdf-dlq, email-dlq)
apps/api/test        Jest e2e suite (e2e-helpers.ts + 5 specs: auth, sales-flow, inventory-flow, finance-flow, tenant-isolation)
apps/worker          BullMQ consumers (PdfProcessor render->persist->upload; EmailProcessor behind MailProvider)
apps/flutter         Flutter client (Riverpod + go_router) — placeholder auth/dashboard only
packages/api_contracts   shared {data,meta}/{error} envelope types
packages/shared_types    cross-language-shape type definitions
packages/config          env schema validation
packages/storage         StorageService facade + S3StorageProvider + LocalDiskProvider
database/prisma          schema.prisma (888 lines), seed.ts (57 permission codes), migrations/
infrastructure/docker    docker-compose.yml (postgres:16-alpine, redis:7-alpine), Dockerfile.api
docs/architecture/decisions   ADRs
```

## Tech stack

- NestJS 10 + TypeScript 5.6, Prisma 6.7, PostgreSQL 16 (RLS), Redis 7 + BullMQ 5, S3-compatible storage (AWS SDK v3, or local disk), pdfkit PDFs, JWT access+refresh rotation, Swagger, Helmet.
- Node >= 20 (enforced in root `engines`). Formatting: Prettier singleQuote, trailingComma "all", printWidth 100.

## Architecture rules (binding, from plan §2 + ADRs)

1. **Flutter never talks to PostgreSQL** — always via the API over HTTPS/REST.
2. **Every tenant-owned record carries `tenant_id`** as a real column, with an index **leading on `(tenant_id, …)`**. Scoping is app-layer (primary) + RLS `ENABLE + FORCE` (backstop). RLS policy: `tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid` — unset context = zero rows, never a leak. Identity/bootstrap tables are RLS-exempt (users, tenants, tenant_users, permissions).
3. **App-layer GUC arming**: `TenantContextInterceptor` (outermost) runs requests inside tenant context; guards arm context themselves. `PrismaService` is `$extends`-ed so every model op and raw op runs as `$transaction([set_config(...), op])`; `withTenant(tenantId, fn)` runs interactive transactions (maxWait 15s, timeout 30s — Neon-aware) that set the GUC.
4. **Complex SQL must be raw + parameterized** (`$queryRaw`/`$executeRaw`): CTEs, window functions, recursive walks, `FOR UPDATE` locks (stock on hand, sequence allocation, trial balance, account rollups). Raw queries are documented under `apps/api/sql/`. Never string-concatenate SQL.
5. **Stock is a derived ledger**, not a mutable column. Every quantity change is an auditable `StockMovement`; `StockBalance` updates atomically with `FOR UPDATE` row locks.
6. **Financial records are immutable after posting** — corrections are reversals, never edits.
7. **API never calls provider SDKs directly** — always through the BullMQ job boundary (workers render PDFs, send mail).
8. **Permission codes over role names** (ADR-0004): code checks `sales.quote.approve` style codes, never role names. Hiding a button is presentation-only; the API enforces server-side.
9. **Business document numbers assigned at post/issue time**, never on draft creation (ADR-0006). Drafts carry `number = null`.
10. **Idempotency on every mutating endpoint** (plan §16a) — client-generated UUID in the `Idempotency-Key` header, key scope `(key, endpoint, user_id)`, PostgreSQL table as source of truth, atomic claim via `INSERT ... ON CONFLICT DO NOTHING` checking `xmax = 0`, 24h TTL.

## Module pattern (how to add a feature module)

Follow `apps/api/src/sales/quotations/` as the reference (controller + service, DTOs in the controller file):

- **Controller**: `@Controller('<plural>')` under the module prefix; every route `@RequirePermissions('<domain>.<verb>')`; business transitions use explicit endpoints — `POST :id/submit`, `POST :id/approve`, `POST :id/post`, `POST :id/cancel` — **never** `PATCH status=` (plan §16). `@CurrentUser() user: AuthUser` resolves identity; DTOs are class-validator + `class-transformer` classes.
- **Service**: constructor-injects `PrismaService`, `AuditService`, and `DocumentNumberingService` where documents get numbers. All queries scope by `tenantId: user.tenantId`. Multi-step writes run inside `this.prisma.withTenant(user.tenantId, async (tx) => {...})`. `findFirst` (not `findUnique`) + `NotFoundException` after failed scoped get.
- **State machine**: `DRAFT → SUBMITTED → APPROVED → POSTED/ISSUED → [DONE]`, with `CANCELLED` branch. Validate transitions in the service; throw `BadRequestException` with a stable machine-readable error code on invalid transitions.
- **Document numbers**: gapped via PostgreSQL sequence per `(tenant, doc_type, financial_year)` + unique on final `document_number`; **gapless** (statutory) via counter row in `document_sequences` with `SELECT ... FOR UPDATE` inside the caller's transaction, retrying on `40001`/`23505`. Prefix format `PREFIX-YYYY-NNNNNN` (e.g. `QTO-2026-000001`, `SO-`, `DEL-`, `INV-`, `PAY-`).
- **Register** the module in `apps/api/src/app.module.ts` imports. Guard/interceptor order is fixed — do not reorder.

Guard/interceptor pipeline (fixed, app.module.ts): `JwtAuthGuard` → `PermissionsGuard` → `TenantContextInterceptor` → `IdempotencyInterceptor` → `TransformInterceptor`.

## Database conventions (binding, plan §11)

- **UUID PKs everywhere** (`gen_random_uuid()`), never SERIAL/BIGSERIAL — enables client-generated IDs / offline.
- Every tenant-owned table: `id UUID`, `tenant_id UUID`, `created_at`/`updated_at` TIMESTAMPTZ(6); transactional entities also `created_by`/`updated_by`.
- **snake_case** columns with `@map()` in Prisma; camelCase in TypeScript.
- **Tenant-scoped uniqueness**: `@@unique([tenantId, sku])`, never global `@@unique([sku])`.
- Offline-capable tables carry nullable `mobile_uuid` with a partial unique index.
- Every tenant-owned table gets RLS `ENABLE + FORCE` via raw SQL steps in the migration (Prisma cannot express RLS).
- Resource tables (products, customers, price lists, UoM) are treated as **read caches**: server-filtered, paginated, versioned for future cursor delta-sync.
- Document migrations live in `database/prisma/migrations/`. New permission codes go into `database/prisma/seed.ts` as lowercase `group.subgroup.verb`.

## API conventions (plan §16-18, ADR-0003)

- Base path `api/v1` (versioned).
- Envelope (enforced by global `TransformInterceptor` / `AllExceptionsFilter`):
  - Success: `{ data, meta? }`
  - Collection: `{ data: [], meta: { page, limit, total } }`
  - Error: `{ error: { code, message, details? } }` — stable machine-readable codes (e.g. `INVOICE_ALREADY_POSTED`); unknown exceptions masked as `INTERNAL_ERROR`.
- Pagination/search/filter via query params: `?page=&limit=&q=&status=&sort=-created_at` — never load a whole table into a client.
- Envelope types live in `packages/api-contracts`.

## Golden rules for making changes

1. Read the relevant ADR + `future.md` status before modifying a domain it covers. The plan and ADRs are binding; a change that contradicts them needs a written justification (new ADR), not a silent drift.
2. Never write a query that can return rows cross-tenant. Scope by `tenantId` AND rely on RLS; keep RLS enabled+forced on every new tenant table.
3. Never `PATCH status=`; add explicit transition endpoints guarded by their own permission.
4. Never edit a posted/financial record — reversal only.
5. Never mutate stock except through audited `StockMovement` rows.
6. Every mutating endpoint: keep `Idempotency-Key` handling in place; never skip the interceptor.
7. Assign document numbers only at post/issue; keep draft `number = null`.
8. Keep raw SQL parameterized and documented in `apps/api/sql/`.
9. Add new permission codes to `database/prisma/seed.ts` (lowercase `group.subgroup.verb`); never reference role names in code.
10. Match existing style: Prettier config is fixed; NestJS controller/service split; DTOs in the controller file; env vars via `packages/config`.


## Implementation directive

When implementing or reviewing changes in this repository:

1. Treat this `SKILL.md`, `ERP_Implementation_Plan_V2.md`, `future.md`, and relevant ADRs as the source of truth.
2. Follow the current implementation status in this skill before starting work; do not rebuild completed phases.
3. Implement changes incrementally in the existing module pattern. Do not introduce a parallel architecture.
4. For new tenant-owned database tables, implement `tenant_id`, tenant-leading indexes, `ENABLE + FORCE RLS`, and the required tenant policy in the same migration.
5. For every mutating API endpoint, preserve idempotency handling.
6. For every stateful business document, use explicit transition endpoints and service-level transition validation.
7. For financial posting, inventory mutation, document numbering, raw SQL, RBAC, and tenant isolation, follow the binding rules above.
8. Update `future.md` only when a corresponding item is fully implemented.
9. Add or update an ADR when a proposed change intentionally alters a binding architectural decision; do not silently drift from an existing ADR.
10. Keep the implementation aligned with the source-of-truth documents and existing architecture.

### New module implementation checklist

For a new ERP module:

```text
[ ] Read relevant ADRs + future.md
[ ] Confirm module dependency/order
[ ] Define database schema + indexes + constraints
[ ] Add tenant RLS migration
[ ] Add permission codes
[ ] Add Prisma model/migration
[ ] Implement controller/service/DTO pattern
[ ] Add explicit workflow transition endpoints
[ ] Add idempotency to mutating endpoints
[ ] Add audit logging
[ ] Update future.md after implementation is complete
```
