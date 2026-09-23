# ERP_SAAS — Multi-tenant SaaS ERP

One shared ERP product across **web, desktop (Windows/macOS/Linux) and mobile (Android/iOS)**, served from a single multi-tenant backend. Order-to-cash and beyond: Sales, Inventory, Finance, Procurement, HR/Payroll, Operations, and the SaaS platform itself.

## Status

Phases **0–9 are implemented** (backend + Flutter client):

| Phase | Scope                                                                              | Status |
| ----- | ---------------------------------------------------------------------------------- | ------ |
| 0–2   | Foundation: auth, multi-tenancy (RLS), RBAC, organization, audit, CRM, master data | Done   |
| 3     | Sales (quotes → orders → deliveries → invoices → payments)                         | Done   |
| 4     | Inventory (warehouses, stock ledger, batches/serials)                              | Done   |
| 5     | Finance (COA, journal, fiscal periods, bank, reports, auto-posting)                | Done   |
| 6     | Procurement (requests, POs, goods receipts, vendor bills/payments)                 | Done   |
| 7     | HR + Payroll (employees, attendance, leaves, salary, payroll runs, payslips)       | Done   |
| 8     | Operations + Dashboard (projects, tasks, approvals, notifications)                 | Done   |
| 9     | SaaS (plans, subscriptions, billing queue, usage, platform admin)                  | Done   |

The authoritative roadmap is `future.md`; the architecture plan is `ERP_Implementation_Plan_V2.md`. **Do not edit `ERP_Implementation_Plan_V1.md`** (superseded baseline).

## Tech stack

| Layer         | Technology                                                     |
| ------------- | -------------------------------------------------------------- |
| Frontend      | Flutter (Riverpod, go_router, dio, flutter_secure_storage)     |
| Backend       | NestJS 10 + TypeScript 5.6, Helmet, Swagger                    |
| Database      | PostgreSQL 16 + Prisma 6.7, RLS tenant isolation, UUID PKs     |
| Cache / Queue | Redis 7 + BullMQ 5 (`pdf`, `email`, `billing` queues + DLQs)   |
| Files         | S3-compatible object storage (AWS SDK v3) or local disk driver |
| PDFs          | pdfkit (documents, invoices, payslips)                         |
| Infra         | Docker Compose, GitHub Actions, render-ready `Dockerfile`      |

Node >= 20 is required (enforced in `backend/package.json` `engines`).

## Architecture in one paragraph

Every tenant-owned row carries `tenant_id`; scoping is app-layer (primary) **and** PostgreSQL RLS `ENABLE + FORCE` (backstop) armed via a `set_config('app.current_tenant_id', …)` transaction GUC. Authorization uses **permission codes** (`sales.quote.approve`), never role names. Documents number only at post/issue (drafts carry `number = null`), via per-tenant sequences. All mutating endpoints accept an `Idempotency-Key` header. The API returns a uniform `{ data, meta? }` / `{ error: { code, message, details? } }` envelope. Background work (PDFs, email, billing) always crosses the BullMQ job boundary — never direct SDK calls from the API.

Binding details live in `docs/architecture/decisions/ADR-*.md` — **read the relevant ADR before changing that domain.** The six ADRs: ORM/Prisma, tenant isolation RLS, API response contract, RBAC permission codes, session refresh rotation, document numbering.

## Repository structure

```text
backend/                    Self-contained NestJS backend (API + worker + Prisma)
  src/                      API source (routes under /api/v1)
    common/                 guards, interceptors, decorators, filters, database, rls
    auth/  tenants/  users/  roles/  permissions/  organization/  audit/
    customers/  products/  categories/  units/  tax-rates/
    sales/                  quotations, orders, deliveries, invoices, payments, bank-accounts
    inventory/              warehouses, stock, stock-ledger
    finance/                accounts, journal, bank, fiscal-periods, reports
    procurement/            vendors, purchase-requests/orders, goods-receipts, vendor-bills/payments
    hr/                     departments, employees, attendance, leave-types, leaves,
                            salary-structures, payroll-runs, payslips
    ops/                    projects, tasks, approvals, notifications, dashboard
    saas/                   plans, subscription, billing, usage, admin
    jobs/                   BullMQ producers + dead-letter service
    worker/                 BullMQ consumers (pdf, email, billing, low-stock, usage-meter)
    prisma/  database/      Prisma client ($extends) + RLS transactions
    contracts/  shared-types/  config/  storage/
  prisma/                   schema.prisma, seed.ts (permissions, COA, demo), migrations/
  sql/                      documented raw SQL (stock, finance, document_sequences)
  test/                     e2e suite (7 specs)
  Dockerfile  docker-compose.yml  .env.example
apps/flutter/               Flutter client (web/desktop/mobile)
docs/architecture/decisions  Binding ADRs
ERP_Implementation_Plan_V2.md  Active architecture plan
future.md                   Living roadmap / gaps
.opencode/skills/erp-saas/  Development guide skill
```

## Prerequisites

- Node.js >= 20
- Docker (PostgreSQL 16 + Redis 7 via Compose) — or point `DATABASE_URL` at an existing Postgres
- Flutter SDK (stable) for the client

## Backend — local development

```powershell
# 1. Start PostgreSQL + Redis
docker compose -f backend/docker-compose.yml up -d

# 2. Configure env
cd backend
copy .env.example .env      # then edit secrets

# 3. Install, migrate, generate client (optional: seed)
npm install
npm run gen:prisma
npm run db:migrate:deploy
npm run db:seed            # permissions, COA, reference data + demo tenant

# 4. Run the API (http://localhost:3000, Swagger at http://localhost:3000/api/v1/docs)
npm run start:dev

# 5. In a second terminal — background worker (PDFs, email, billing)
npm run start:dev:worker
```

### Scripts (`backend/package.json`)

| Command                                                              | Purpose                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run start:dev`                                                  | API with watch (port 3000)                                  |
| `npm run start:dev:worker`                                           | BullMQ worker with watch                                    |
| `npm run build` / `npm run start` / `npm run start:worker`           | Production build & run                                      |
| `npm run lint`                                                       | TypeScript typecheck (`tsc --noEmit`)                       |
| `npm test`                                                           | Jest unit tests (`src/**/*.spec.ts`)                        |
| `npm run test:e2e`                                                   | e2e specs (`backend/test/*.e2e-spec.ts`, 180s timeout)      |
| `npm run gen:prisma`                                                 | `prisma generate` (emit to `src/database/generated/client`) |
| `npm run db:migrate` / `db:migrate:deploy` / `db:seed` / `db:studio` | Prisma CLI                                                  |

> **Redis is optional for the API.** It boots without Redis (logs one `redis unreachable` warning; enqueueing endpoints return a fast `503 Job queue unavailable`). The worker genuinely requires Redis.
>
> Migrations use the `DIRECT_URL` (non-pooler) endpoint so advisory locks and transaction GUCs behave; the API runtime only needs `DATABASE_URL`. On Neon, leave `connection_limit` + `pool_timeout` set to avoid cold-start failures.

### Environment variables (`backend/.env.example`)

| Variable                                           | Default                            | Notes                                                |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `NODE_ENV` / `PORT` / `API_PREFIX`                 | `development` / `3000` / `/api/v1` |                                                      |
| `DATABASE_URL`                                     | local postgres                     | Runtime; use pooler host for pooled (Neon) endpoints |
| `DIRECT_URL`                                       | local postgres                     | Prisma CLI / migrations (advisory locks, GUCs)       |
| `REDIS_URL`                                        | `redis://localhost:6379`           | Optional for API, required for worker                |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`         | dev placeholders                   | Rotation + refresh-token hashing (ADR-0005)          |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d`                       |                                                      |
| `STORAGE_DRIVER`                                   | `local`                            | `local` (writes under `STORAGE_LOCAL_DIR`) or `s3`   |
| `STORAGE_*`                                        | Minio defaults                     | S3 driver requires access/secret keys                |
| `CORS_ORIGINS` / `SWAGGER_ENABLED`                 | `*` / `true`                       | Swagger disabled in production                       |

### Demo tenant & users

After `npm run db:seed`, a `demo` tenant exists with these users (password `Demo1234!`):

- `owner@demo.erp` (Owner)
- `admin@demo.erp` (Admin)
- `sales@demo.erp` (Sales)
- `finance@demo.erp` (Finance)
- `warehouse@demo.erp` (Inventory)

Demo documents are intentionally **not** seeded — they must flow through the service layer (numbering/stock/ledger) so the e2e suite exercises real behavior.

## Database conventions

- UUID primary keys everywhere (`gen_random_uuid()`), never serial.
- Every tenant-owned table: `id`, `tenant_id`, `created_at`/`updated_at`; transactional entities also have `created_by`/`updated_by`.
- `snake_case` columns (`@map` in Prisma), camelCase in TypeScript.
- Tenant-scoped uniqueness, e.g. `@@unique([tenantId, sku])` — never global.
- RLS `ENABLE + FORCE` on every tenant table via raw steps in migrations (Prisma cannot express RLS).
- Stock is a **derived ledger**: only audited `StockMovement` rows; `StockBalance` updates under `FOR UPDATE` locks.
- Financial records are immutable after posting — corrections are reversals.
- Complex SQL (CTEs, window functions, `FOR UPDATE`) lives as parameterized raw queries documented in `backend/sql/`.

## API conventions

- Base path `/api/v1` (URI versioned). Swagger at `/api/v1/docs` (dev).
- Response envelope `{ data, meta? }`; collections `{ data: [], meta: { page, limit, total } }`; errors `{ error: { code, message, details? } }` with stable machine-readable codes (e.g. `INVOICE_ALREADY_POSTED`). Unknown exceptions mask as `INTERNAL_ERROR`.
- Pagination/search/filter: `?page=&limit=&q=&status=&sort=-created_at` — never load whole tables.
- Auth: `POST /api/v1/auth/register`, `.../auth/login`, `.../auth/refresh`, `.../auth/logout` → JWT access token + rotating refresh token.
- Every mutating endpoint honors an `Idempotency-Key` header (24h TTL).
- Stateful documents use **explicit transition endpoints** (`POST :id/submit|approve|post|cancel`), never `PATCH status=`.
- Document numbers are per-tenant, assigned at post/issue: `QTO-`, `SO-`, `DEL-`, `INV-`, `PAY-` (sales), `JE-` (journal), `PR-`, `PO-`, `GRN-`, `VB-`, `VP-` (procurement), `PR-YYYY-MM` (payroll) — gapped via sequences, gapless via `document_sequences` counter rows.
- Permission enforcement: `@RequirePermissions('<group>.<subgroup>.<verb>')` on every route; codes seeded in `backend/prisma/seed.ts` (120+ codes).

## Tests

- **Unit** — `npm test` (from `backend/`): guards, interceptors, filters, RLS transactions, numbering, session service.
- **e2e** — `npm run test:e2e` requires a running Postgres. Seven specs: `auth`, `tenant-isolation`, `idempotency`, `sales-flow`, `inventory-flow`, `finance-flow`, `procurement-flow`. Per team policy these run in CI, not as a local dev regression.
- **Flutter** — `flutter analyze` + `flutter test` (from `apps/flutter/`).

## Flutter client

```bash
flutter pub get
flutter run -d windows      # or -d chrome / an Android device
```

The API base URL is compiled in: default `http://localhost:3000/api/v1`, override with
`flutter run --dart-define=API_BASE_URL=https://…/api/v1`
(Android emulator: use `http://10.0.2.2:3000/api/v1`).

Feature screens mirror the backend modules under `apps/flutter/lib/features/` (auth, dashboard, sales, inventory, finance, procurement, hr, ops, settings). Client state: Riverpod + generated providers; routing via `go_router`; tokens persisted with `flutter_secure_storage`.

## Deployment

The `backend/` directory is self-contained and deploys as-is:

- **Docker**: `docker build -f backend/Dockerfile backend`; runtime services in `backend/docker-compose.yml`.
- **Render (or any Node 20 host)**: root directory `backend`, build `npm ci && npm run gen:prisma && npm run build`, start `node dist/main.js`. Add env vars from `backend/.env.example`.
- **Worker**: second service, same build, start `node dist/worker/main.js` — requires Redis.

## Working in this repo — read first

1. Load the built-in `erp-saas` skill (`.opencode/skills/erp-saas/SKILL.md`) — it is the working guide for the module pattern and conventions.
2. Read `ERP_Implementation_Plan_V2.md`, `future.md`, and any relevant ADR before changing a domain they cover. The plan and ADRs are binding; changing a binding decision requires a written ADR, not silent drift.
3. New permission codes go into `backend/prisma/seed.ts` (lowercase `group.subgroup.verb`).
4. Keep raw SQL parameterized + documented in `backend/sql/`.
5. New tenant tables must ship `tenant_id`, tenant-leading indexes, and `ENABLE + FORCE` RLS in the same migration.
