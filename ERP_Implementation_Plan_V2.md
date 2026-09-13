# Multi-Tenant ERP — Implementation Plan (V2)

> **V2 revision notes** — Applied architecture-review amendments on top of V1. Existing section numbers are preserved; the new idempotency section is inserted as **§16a** so no downstream renumbering was required.
>
> 1. **§1** — ORM decision committed (Prisma) with a raw-SQL rule for advanced queries.
> 2. **§3** — Seed/fixture strategy defined (standard COA, tax, UoM, roles, demo tenant).
> 3. **§7** — Multi-tenancy endgame: RLS as a DB-level backstop + portable scale-out path.
> 4. **§11** — Offline-ready conventions (UUID PKs, idempotency, read caches) folded into database conventions.
> 5. **NEW §16a** — Idempotency keys for mutating endpoints.
> 6. **§20** — Offline day-one data-model rules (without enabling offline in V1).
> 7. **§22** — Notification transports, providers, retry + dead-letter guarantees.
> 8. **§23** — Document file lifecycle (immutable S3 versions, `document_files`).
> 9. **§27** — Phase 7 split into 7a (HR Master) / 7b (Payroll).
> 10. **§29** — Production readiness checklist extended.
> 11. **§31** — ERD deliverable scope expanded (sessions, idempotency_keys, document_sequences, mobile_uuid, RLS, COA seed, document_files).

---

## 1. Product Definition

Build a multi-tenant SaaS ERP with one shared product experience across:

- Web
- Windows/macOS/Linux desktop
- Android/iOS mobile

High-level architecture:

```text
Flutter Clients
   |
   | HTTPS / REST
   v
API / Application Server
   |
   +--> Background Workers
   |
   v
PostgreSQL
   |
   +--> Redis
   |
   +--> S3-compatible Object Storage
```

### Recommended technology stack

| Layer            | Technology                   |
| ---------------- | ---------------------------- |
| Frontend         | Flutter                      |
| State management | Riverpod                     |
| Routing          | go_router                    |
| Backend          | NestJS + TypeScript          |
| API              | REST + OpenAPI               |
| Database         | PostgreSQL                   |
| ORM              | Prisma                       |
| Cache / Queue    | Redis                        |
| Background jobs  | BullMQ / Redis               |
| File storage     | S3-compatible object storage |
| Containers       | Docker                       |
| CI/CD            | GitHub Actions               |
| Error monitoring | Sentry                       |
| Logging          | Structured server-side logs  |

The exact libraries may change, but the architectural boundaries should remain stable.

### ORM decision: Prisma

Prisma is the committed ORM.

- Schema-first workflow with generated, type-safe clients fits the API-contract discipline in §3.
- PostgreSQL **Row-Level Security** (RLS) is supported through Prisma Client Extensions to Prisma as the tenant-scoping mechanism (see §7).
- Queries that need CTEs, window functions, recursive ledger walks, or explicit row locks (`FOR UPDATE`) — roughly 10% of an ERP's SQL — must be written in **parameterized raw SQL** (`$queryRaw` / `$executeRaw`), never in string concatenation.
- Raw queries are documented in a dedicated `sql/` directory, annotated with the business logic, and **must be covered by an integration test**.

Example of a query that must use raw SQL:

```text
- Trial balance aggregation
- Concurrency-safe sequence allocation (§12)
- Recursive account-group rollups
- Stock-on-hand window-function queries
```

TypeORM is not adopted by default; revisit only with a written justification on the architecture decision log.

---

# 2. Architecture Rules

These rules should be treated as engineering constraints.

## Rule 1 — Flutter never connects directly to PostgreSQL

Correct:

```text
Flutter
  ↓
API
  ↓
Business Logic
  ↓
PostgreSQL
```

Never:

```text
Flutter → PostgreSQL
```

## Rule 2 — Tenant-owned records contain `tenant_id`

Examples:

```text
customers
products
warehouses
sales_orders
invoices
payments
employees
journal_entries
```

Each should be associated with a tenant.

## Rule 3 — Tenant isolation is enforced on the server

Do not trust a tenant ID supplied by the Flutter client.

The backend should determine the active tenant from authenticated user membership/session data.

## Rule 4 — Financial transactions are immutable after posting

Posted accounting records should not be silently edited or deleted.

Use:

```text
Incorrect Entry
   ↓
Reversal
   ↓
Correct Entry
```

## Rule 5 — Business documents use controlled lifecycle states

Example:

```text
DRAFT
  ↓
SUBMITTED
  ↓
APPROVED
  ↓
POSTED
  ↓
CANCELLED
```

Business actions must validate legal state transitions.

---

# 3. Repository Structure

Use a monorepo while the product is being developed as a unified platform.

```text
erp/
│
├── apps/
│   ├── flutter/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── api_contracts/
│   ├── shared_types/
│   └── config/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── fixtures/
│
├── infrastructure/
│   ├── docker/
│   ├── nginx/
│   └── deployment/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   └── decisions/
│
└── .github/
    └── workflows/
```

### Seed & fixture strategy

`database/` has three clearly separated layers:

| Layer         | Purpose                           | Contents                                                                                                                                                                 |
| ------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrations/` | Schema only                       | Tables, columns, indexes, constraints, RLS policies. **No reference data.**                                                                                              |
| `seeds/`      | Production-required standard data | Default **chart of accounts**, standard tax rates, base unit-of-measure set, platform-level roles + permission codes. A working ERP does not exist without a seeded COA. |
| `fixtures/`   | Test / demo environments          | **Demo tenant** seed (company, users, roles, customers, products, sample documents) used by e2e tests and demo deployments.                                              |

Rules:

- Reference data used by business modules (tax rates, UoM, COA) lives in seeds, not migrations.
- Fixtures must be idempotent (re-runnable) and tagged to an environment.
- The COA seed is versioned alongside the accounting module it supports.

---

# 4. Flutter Architecture

Use feature-first organization instead of a global `screens/`, `widgets/`, and `services/` structure.

```text
apps/flutter/lib/

├── app/
│   ├── app.dart
│   ├── router/
│   ├── theme/
│   └── bootstrap/
│
├── core/
│   ├── network/
│   ├── auth/
│   ├── permissions/
│   ├── storage/
│   ├── errors/
│   ├── localization/
│   └── ui/
│
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── organization/
│   ├── crm/
│   ├── sales/
│   ├── inventory/
│   ├── procurement/
│   ├── finance/
│   ├── hr/
│   ├── projects/
│   ├── documents/
│   ├── notifications/
│   └── settings/
│
└── shared/
    ├── models/
    ├── enums/
    ├── formatters/
    └── validators/
```

Each major feature follows:

```text
feature/
├── data/
│   ├── datasources/
│   ├── models/
│   └── repositories/
│
├── domain/
│   ├── entities/
│   └── usecases/
│
└── presentation/
    ├── pages/
    ├── widgets/
    └── providers/
```

---

# 5. Backend Architecture

Use feature/module-based NestJS structure.

```text
apps/api/src/

├── main.ts
├── config/
│
├── common/
│   ├── guards/
│   ├── interceptors/
│   ├── decorators/
│   ├── filters/
│   └── utils/
│
├── auth/
├── tenants/
├── users/
├── roles/
├── permissions/
├── organization/
├── crm/
├── sales/
├── inventory/
├── procurement/
├── finance/
├── hr/
├── projects/
├── documents/
├── notifications/
├── subscriptions/
└── audit/
```

Each business module should have a consistent pattern:

```text
controller
service
repository
dto
model/entity
validation
authorization
tests
```

---

# 6. Foundation Layer

Do not start with Finance or HR.

Build the platform foundation first:

```text
1. Authentication
2. Tenant management
3. Organization
4. Users
5. Roles
6. Permissions
7. Audit logging
8. File storage
9. Notifications
10. Settings
```

Dependency chain:

```text
Authentication
      ↓
Tenant
      ↓
Organization
      ↓
User
      ↓
Role
      ↓
Permission
      ↓
ERP Modules
```

---

# 7. Multi-Tenancy Model

Start with a shared PostgreSQL database.

Conceptually:

```text
Database
│
├── Tenant A
│   ├── users
│   ├── customers
│   ├── products
│   └── invoices
│
├── Tenant B
│   ├── users
│   ├── customers
│   ├── products
│   └── invoices
│
└── Tenant C
    └── ...
```

This is simpler operationally than a separate database per customer for V1.

### Tenant table

```text
tenants
--------
id
name
slug
status
timezone
currency
country
language
created_at
updated_at
```

### Tenant membership

```text
tenant_users
------------
tenant_id
user_id
status
```

A user can therefore belong to multiple companies in the future.

### Defense in depth: Row-Level Security (RLS) + app-layer scoping

Tenant isolation is enforced twice — this is not optional:

1. **App layer (primary):** The backend resolves the tenant from the authenticated session and filters every query through a tenant-scoped Prisma client. The tenant context is set inside the transaction via `SELECT set_config('app.current_tenant_id', $1, true)` — inside each transaction, so it is PgBouncer-safe.
2. **Database layer (backstop):** PostgreSQL **Row-Level Security** policies are enabled and forced on every tenant-owned table. A query that bypasses the app layer (a missed filter, a raw query, a background job) still returns no rows from another tenant.

```text
RLS policy example (conceptual)
  col: tenant_id = current_setting('app.current_tenant_id', true)
```

This "belt and suspenders" approach is what makes the automation rule in §25 ("Tenant A can NEVER read Tenant B") enforceable rather than aspirational.

### SaaS scale-out path (post-V1)

Shared database is the V1 model, but the schema must stay **portable** so a large tenant can later be moved to schema-per-tenant or database-per-tenant without a data-model redesign. Constraints that keep this possible:

- Every tenant-owned table carries `tenant_id` as a real column with an index leading on `(tenant_id, ...)`.
- All primary/foreign keys are UUIDs (see §11).
- No cross-tenant static references are allowed in code — tenant selection is always driven by session context.
- If a tenant outgrows the shared DB, the path is: replicate schema → copy rows filtered by `tenant_id` → repoint the tenant → backfill. Designing the data model around `tenant_id` filtering from day one makes this a mechanical operation.

Do not build this migration infrastructure in V1; only keep the data-model constraints that make it possible.

---

# 8. Identity Model

Keep `User` and `Employee` separate.

```text
User
 ├── Authentication
 ├── Tenant membership
 └── Permissions

Employee
 ├── HR information
 ├── Department
 ├── Attendance
 └── Payroll
```

A user account does not have to be an employee.

Example:

```text
External Accountant
      ↓
User account
      ↓
Finance permissions
      ↓
No HR employee record
```

---

# 9. RBAC

Use permission codes instead of hard-coded roles.

Examples:

```text
sales.quote.view
sales.quote.create
sales.quote.edit
sales.quote.approve
sales.quote.cancel

sales.order.view
sales.order.create
sales.order.approve

finance.invoice.view
finance.invoice.create
finance.invoice.approve
finance.invoice.post

inventory.stock.view
inventory.stock.adjust

hr.employee.view
hr.employee.edit

hr.payroll.view
hr.payroll.approve
```

Authorization flow:

```text
Request
  ↓
JWT
  ↓
User
  ↓
Tenant Membership
  ↓
Role
  ↓
Permission
  ↓
Business Operation
```

Hiding a Flutter button is not authorization. The API must enforce the same permission.

---

# 10. Core Database Domains

## Platform

```text
tenants
users
tenant_users
roles
permissions
role_permissions
user_roles
audit_logs
subscriptions
sessions
idempotency_keys
document_sequences
```

## Organization

```text
companies
branches
departments
locations
employees
```

## CRM

```text
customers
customer_contacts
leads
lead_activities
```

## Inventory

```text
products
product_categories
units
warehouses
warehouse_locations
stock_balances
stock_movements
batches
serial_numbers
```

## Sales

```text
quotations
quotation_items
sales_orders
sales_order_items
deliveries
delivery_items
invoices
invoice_items
payments
```

## Finance

```text
accounts
account_groups
journal_entries
journal_entry_lines
tax_rates
fiscal_periods
bank_accounts
bank_transactions
```

## Support

```text
document_files
sync_state
```

---

# 11. Database Conventions

Standardize these conventions before creating many tables.

Typical primary entity fields:

```text
id UUID
tenant_id UUID
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Important transactional entities should also track:

```text
created_by
updated_by
```

Use database constraints for:

```text
NOT NULL
UNIQUE
FOREIGN KEY
CHECK
```

Use tenant-scoped uniqueness where appropriate.

Example:

```text
UNIQUE(tenant_id, sku)
```

instead of globally unique:

```text
UNIQUE(sku)
```

This lets different companies use the same SKU.

### Offline-ready conventions (binding from V1)

These are irreversible schema decisions. Apply them from the first migration even though offline mode ships later:

- **All primary and foreign keys are UUIDs** (`gen_random_uuid()`), never `SERIAL`/`BIGSERIAL`. Client-generated IDs are then possible without collision.
- Every table that may later be created or edited offline (sales orders, deliveries, attendance, expense claims) also carries a nullable `mobile_uuid` column with a partial unique index, so one device can reference a record it created locally before the server assigns the real document number.
- Reference-download data (products, customers, price lists, UoM) is treated as a **read cache**: it is server-filtered, paginated, and versioned for cursor-based delta sync in V2. Nothing about the data model should make "download my product catalog" hard later.
- Every mutating endpoint accepts an `Idempotency-Key` (see §16a). Offline retries reuse the same key, so at-least-once delivery stays idempotent on the server.
- Keep design for the **outbox pattern** in mind for field operations (draft sales orders, delivery capture, attendance): local write + outbox entry in one transaction on the device, drained FIFO when online. No outbox code ships in V1; the server-side idempotency contract that the outbox would rely on does.

---

# 12. Document Numbering

User-visible business numbers should not be database UUIDs.

Examples:

```text
INV-2026-000001
INV-2026-000002
SO-2026-000001
PO-2026-000001
```

Suggested table:

```text
document_sequences
------------------
tenant_id
document_type
financial_year
prefix
next_number
```

This permits company-specific formats such as:

```text
INV/2026-27/00001
SO/2026-27/00001
PO/2026-27/00001
```

### Concurrency & numbering rules

Duplicate document numbers are a correctness failure. `document_sequences` is a **mandatory** schema deliverable in §31, with these rules:

- **Default pattern (all document types):** a PostgreSQL sequence per `(tenant, document_type, financial_year)` plus a `UNIQUE` constraint on the final `document_number` column as the last line of defense. Gaps allowed.
- **Gapless pattern (tax invoices / statutory documents):** a counter row in `document_sequences` updated inside the same transaction with `SELECT ... FOR UPDATE` on the (tenant, doc_type, year) row, so concurrent allocations serialize. Use only where regulation demands gapless numbering — it is a throughput bottleneck by design.
- **Assignment timing:** the user-visible number is assigned at **post / issue** time, never at draft creation. Drafts carry no visible number.
- **Retry loop:** allocation code must retry on serialization failures (`40001`) and unique violations (`23505`), including the Odoo-style number-collision retry where an in-flight document claims a number then rolls back.
- **Reset rules:** per-tenant financial-year granularity is explicit; the sequence/`next_number` must roll over per `financial_year` so `INV-2026-000001` and `INV-2027-000001` can both exist.

---

# 13. First Major Business Workflow — Sales

Build one end-to-end vertical slice first:

```text
Customer
   ↓
Quotation
   ↓
Sales Order
   ↓
Delivery
   ↓
Invoice
   ↓
Payment
   ↓
Accounting
```

Example document lifecycle:

```text
Quotation
    ↓ accepted
Sales Order
    ↓ delivered
Delivery Note
    ↓ invoiced
Invoice
    ↓ paid
Payment
```

This should become the first complete integration test of the ERP platform.

---

# 14. Inventory Architecture

Do not implement stock as a mutable number only:

```text
product.stock = product.stock - 2
```

Instead maintain auditable stock movements.

Example:

```text
stock_movements

SALE
quantity = -2
warehouse = A
reference = DEL-2026-00125
```

Possible movement types:

```text
PURCHASE       +100
SALE            -20
TRANSFER        -10
TRANSFER        +10
ADJUSTMENT       -2
RETURN           +3
```

This provides traceability and supports reconciliation.

---

# 15. Finance Integration

Operational documents should create accounting events automatically wherever possible.

### Invoice example

```text
Invoice
   ↓
Accounting Service
   ↓
Journal Entry
   ↓
Debit: Accounts Receivable
Credit: Sales Revenue
Credit: Output Tax
```

### Payment example

```text
Payment
   ↓
Journal Entry
   ↓
Debit: Bank
Credit: Accounts Receivable
```

This connects operational workflows to the general ledger.

---

# 16. API Standards

Version the API:

```text
/api/v1/
```

CRUD example:

```text
GET    /api/v1/customers
GET    /api/v1/customers/:id
POST   /api/v1/customers
PATCH  /api/v1/customers/:id
DELETE /api/v1/customers/:id
```

Business actions should use explicit endpoints:

```text
POST /api/v1/invoices/:id/submit
POST /api/v1/invoices/:id/approve
POST /api/v1/invoices/:id/post
POST /api/v1/invoices/:id/cancel
```

Avoid allowing clients to arbitrarily change lifecycle state:

```text
PATCH invoice.status = "posted"
```

The backend must validate the transition and required permissions.

---

# 16a. Idempotency

Mutating endpoints (payments, bank transactions, deliveries, document posting) are **double-submit hazards**. Every mutating endpoint must be safe to call more than once via an idempotency key.

### Protocol

- The **client generates** a UUID (v4/v7) and sends it in the `Idempotency-Key` header — never in the body.
- The server treats a retry with the same key + same scoped identity + same request payload as no-op and returns the stored result.
- **Scope:** key uniqueness is `(key, endpoint, user_id)`. The same key on a different endpoint is a different operation.
- Requests without a key proceed normally (opt-in via a NestJS guard/interceptor).
- TTL: 24 hours (industry standard). Partial indexes bound uniqueness to the active window.

### Storage — PostgreSQL (source of truth)

```text
idempotency_keys
------------------
key          TEXT          -- client-supplied UUID
endpoint     TEXT          -- request path
user_id      UUID
request_hash TEXT          -- SHA-256 of canonicalized (sorted-key) body
status       TEXT          -- pending | processing | complete | failed
response_code INT
response_body JSONB
locked_at    TIMESTAMPTZ
created_at   TIMESTAMPTZ
finished_at  TIMESTAMPTZ
expires_at   TIMESTAMPTZ   -- created_at + 24h
```

- **Atomic claim:** `INSERT ... ON CONFLICT DO NOTHING` and inspect the result (`xmax = 0` means this request won the claim) — this eliminates the check-then-insert TOCTOU race.
- A colliding request sees:
  - `complete` → return the cached response (200/201) with the stored body.
  - `processing` → `409 Conflict` or `202 + Retry-After`.
  - `failed` → surface the stored error.
- **Zombie sweeper:** a scheduled job resets rows stuck in `processing` for more than ~5 minutes (a crashed worker). Every reset is logged and worth investigating.
- Redis may act as a fast-path cache; the PostgreSQL table remains the source of truth for correctness.
- Payments must be covered by idempotency before Phase 3 ships.

---

# 17. API Response Standards

### Success

```json
{
  "data": {},
  "meta": {}
}
```

### Collection

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 241
  }
}
```

### Error

```json
{
  "error": {
    "code": "INVOICE_ALREADY_POSTED",
    "message": "Posted invoices cannot be edited."
  }
}
```

Keep this format consistent across every module.

---

# 18. Pagination, Search and Filtering

ERP tables can contain very large datasets.

Never load an entire table into Flutter.

Example:

```text
GET /api/v1/invoices
    ?page=1
    &limit=25
    &search=acme
    &sort=-created_at
    &status=approved
```

The API should perform filtering, sorting and pagination.

---

# 19. Responsive UX

Do not simply shrink the desktop application for mobile.

## Desktop / Web

Prioritize:

```text
Data tables
Complex forms
Reports
Charts
Bulk actions
Side navigation
```

## Mobile

Prioritize:

```text
Dashboard
Approvals
Notifications
Quick actions
Tasks
Field operations
```

Use the same domain/business logic but separate presentation patterns when necessary.

---

# 20. Offline Strategy

For V1 use:

```text
Online-first
```

Consider offline functionality later for:

```text
Customer lookup
Product lookup
Assigned tasks
Draft sales orders
Field activities
Attendance
```

Avoid offline accounting posting and other high-risk financial operations in the first release.

### Day-one data-model rules (no V1 offline feature)

Offline mode ships later, but its data-model prerequisites are **irreversible** and must be in place from the first migrations (§11):

- **UUID primary/foreign keys everywhere** — enables conflict-free client-generated IDs.
- **`mobile_uuid` columns** on offline-created tables (sales orders, deliveries, attendance, expense claims) — one device can reference its own un-synced records.
- **Idempotency keys on every mutating endpoint** (§16a) — the server-side contract that offline retries rely on.
- Reference data (customers, products, price lists) designed as **read caches** with cursor-based delta sync in mind.

Designing the data model this way costs almost nothing now and is architecturally impossible to retrofit cleanly after many tables and endpoints exist.

---

# 21. Audit System

Important operations should automatically generate audit records.

Suggested structure:

```text
audit_logs
----------
id
tenant_id
user_id
action
entity_type
entity_id
old_values
new_values
ip_address
created_at
```

Example:

```text
USER: John
ACTION: invoice.approve
ENTITY: INV-2026-00123
TIME: 2026-09-13 10:32
```

Prefer centralized backend instrumentation instead of manually coding audit logging in every feature.

---

# 22. Notifications

Use one central event-driven notification service.

```text
Business Event
     ↓
Notification Service
     ↓
 ┌────────────┬────────────┬────────────┐
 │ In-app     │ Email      │ Push       │
 └────────────┴────────────┴────────────┘
```

Examples:

```text
Invoice approved
Low stock
Leave approved
Purchase order awaiting approval
Payment overdue
New lead assigned
```

### Transport & delivery decisions

- **Realtime transport:** WebSocket (server → Flutter) for in-app notifications. The notification service consumes domain events from BullMQ and fans out across channels — it is not the thing that triggers business logic.
- **Providers:** one email provider and FCM (+APNs) for push, chosen during Phase 0 and abstracted behind a `NotificationProvider` interface. Application code must never call a provider SDK directly.
- **Delivery guarantees:** every notification is a BullMQ job. Failed deliveries retry with backoff; jobs that exhaust retries go to a **dead-letter queue** where they are surfaced to operations rather than silently dropped.
- **Preferences:** per-user, per-channel subscription and quiet-hours persisted server-side; the Flutter client reads them, never the reverse.

---

# 23. Background Worker

Long-running work should not block normal API requests.

Use background workers for:

```text
PDF invoice generation
Email delivery
Push notifications
Report generation
Bulk imports
Large exports
Scheduled jobs
File processing
```

Example:

```text
POST Invoice
      ↓
API saves invoice
      ↓
Queue job
      ↓
Worker processes PDF
      ↓
PDF stored in object storage
      ↓
Notification sent
```

### Document file lifecycle

Generated documents (PDFs) are business records and follow the immutability principle of §2 Rule 4.

- Files are **immutable** in S3, keyed by `(tenant, document_type, document_id, version)`.
- A `document_files` table tracks each generation request: status, checksum, version, and the target document. Regeneration (template change, content correction) creates a **new version** — it never overwrites an existing file.
- Re-downloads return the latest issued version; the audit trail retains links to all prior versions.
- Worker retries and dead-lettering for PDF generation follow §22's delivery guarantees (exhausted retries land on the dead-letter queue and are surfaced to operations).

---

# 24. Security Baseline

Before production:

```text
HTTPS everywhere
JWT access tokens
Refresh-token rotation
Password hashing
Rate limiting
Input validation
SQL injection protection
CORS policy
CSRF protection where applicable
RBAC authorization
Tenant isolation
Audit logging
Encrypted secrets
Database backups
Object storage access controls
```

The most important property:

```text
Tenant A can NEVER access Tenant B data.
```

Automated cross-tenant security tests are mandatory.

### Session & refresh-token design

The "refresh-token rotation" line above is not a checkbox. Concretely:

- **Access JWT:** short TTL (~15 minutes).
- **Refresh token:** long-lived, stored in each platform's **secure storage** (Keychain / Secure Storage), never in SQLite or shared preferences.
- **Rotation with reuse detection:** each refresh issues a new refresh token and rotates the previous one. Reusing an already-rotated token revokes the entire session family — this catches token theft.
- **Sessions table:** a `sessions` record holds the refresh-token **hash** (never the raw token), device metadata, and revocation status. Logout revokes server-side, and revocation propagates to all devices.
- **Client behavior:** silent background refresh while the UI is active; on app restart, recover the session from secure storage and refresh before showing data.

---

# 25. Testing Strategy

Testing begins with the first feature, not at the end.

## Flutter

```text
Unit tests
Widget tests
Integration tests
```

## Backend

```text
Unit tests
Integration tests
API / E2E tests
```

## Database

```text
Migration tests
Seed/fixture validation
Constraint tests
```

## Security

```text
Tenant-isolation tests
Authorization tests
Permission boundary tests
```

Critical example:

```text
User from Tenant A
      ↓
Requests Tenant B invoice
      ↓
403/404
      ↓
No data returned
```

Repeat this pattern across all tenant-owned resources.

Extensions required by V2 amendments:

- **Idempotency tests:** double-submit of the same key returns the first response; concurrent claims serialize; `processing` → zombie reset works.
- **Sequence-concurrency tests:** parallel posting of N documents in one tenant/year produces N unique numbers; gapless mode produces a contiguous range.
- **RLS tests:** raw/`$queryRaw` paths that bypass the tenant-scoped client still return nothing from another tenant.

---

# 26. CI/CD

Every pull request should run:

```text
1. Formatting
2. Static analysis
3. Unit tests
4. Integration tests
5. API build
6. Flutter build
```

Deployment flow:

```text
GitHub
   ↓
CI
   ↓
Docker Images
   ↓
Staging
   ↓
Smoke Tests
   ↓
Production
```

Maintain separate environments:

```text
development
staging
production
```

---

# 27. Development Phases

## Phase 0 — Architecture

Deliver:

```text
✓ Repository
✓ Monorepo structure
✓ Database conventions
✓ API conventions
✓ Authentication design
✓ Tenant design
✓ RBAC design
✓ Error format
✓ CI pipeline
✓ Local development environment
```

No major business module yet.

### Definition of Done

A developer can clone the repository, start the stack locally, run migrations, run tests, and build the applications.

---

## Phase 1 — Platform Foundation

Build:

```text
✓ Registration / login
✓ Tenant creation
✓ Tenant switching
✓ User management
✓ Roles
✓ Permissions
✓ Organization
✓ Branches
✓ Settings
✓ Audit logs
✓ File storage
✓ Sessions + refresh-token rotation
✓ Idempotency mechanism established (§16a)
```

### Definition of Done

A company can register, create its organization, invite users, assign roles, and access only its own data. Mutating endpoints are idempotency-safe by the end of this phase.

---

## Phase 2 — CRM + Master Data

Build:

```text
✓ Customers
✓ Contacts
✓ Products
✓ Categories
✓ Units
✓ Tax configuration
```

### Definition of Done

A tenant can create and manage reusable customers and products used by downstream modules.

---

## Phase 3 — Sales

Build:

```text
✓ Quotations
✓ Sales orders
✓ Delivery
✓ Invoices
✓ Payments
✓ PDF documents
```

Complete workflow:

```text
Customer
→ Quote
→ Order
→ Delivery
→ Invoice
→ Payment
```

### Definition of Done

A full sales transaction can be created, approved, delivered, invoiced, paid and audited. Payments are covered by idempotency keys. Paid/invoice documents generate numbers through the §12 sequence contract.

---

## Phase 4 — Inventory

Build:

```text
✓ Warehouses
✓ Stock
✓ Stock movements
✓ Transfers
✓ Adjustments
✓ Batches
✓ Serial numbers
✓ Low-stock alerts
```

Integrate:

```text
Purchases → Stock
Sales → Stock
Returns → Stock
Adjustments → Stock
```

### Definition of Done

Every inventory quantity change has an auditable movement reference.

---

## Phase 5 — Finance

Build:

```text
✓ Chart of accounts (seeded per §3)
✓ Journal entries
✓ General ledger
✓ Accounts receivable
✓ Accounts payable
✓ Bank accounts
✓ Bank transactions
✓ Reconciliation
✓ Tax reports
✓ Fiscal periods
```

Integrate:

```text
Sales → Finance
Purchasing → Finance
Payments → Finance
```

### Definition of Done

Operational transactions can generate correct accounting entries and financial reports can reconcile to transaction data.

---

## Phase 6 — Procurement

Build:

```text
✓ Vendors
✓ Purchase requests
✓ Purchase orders
✓ GRN
✓ Vendor bills
✓ Vendor payments
```

Workflow:

```text
Purchase Request
      ↓
Purchase Order
      ↓
Goods Receipt
      ↓
Vendor Bill
      ↓
Payment
```

---

## Phase 7a — HR Master

Build the HR foundation without payroll:

```text
✓ Employees
✓ Departments
✓ Attendance
✓ Leave
```

### Definition of Done

A tenant can maintain the employee roster, departments, attendance records, and the leave cycle, fully audited and permissioned.

---

## Phase 7b — Payroll

Build after HR Master is stable:

```text
✓ Salary structures
✓ Payroll runs
✓ Payslips
✓ Payslip PDFs
```

Payroll is a distinct, high-risk subdomain (statutory reporting, reversals of runs, sensitive data). It depends on:

- The PDF worker and `document_files` lifecycle (§23).
- The seeded chart of accounts (§3) for payroll journal entries.
- The reversal discipline of §2 Rule 4 for posted payroll runs.

Keep payroll accounting integration logically separated from basic employee/attendance functionality.

### Definition of Done

A payroll run can be computed, approved, posted, reversed when needed, and its payslips generated, stored, and audited.

---

## Phase 8 — Operations

Build:

```text
✓ Projects
✓ Tasks
✓ Approvals
✓ Documents
✓ Notifications
✓ Dashboards
```

---

## Phase 9 — SaaS Platform

After core ERP workflows are stable:

```text
✓ Subscription plans
✓ Trials
✓ Billing
✓ Feature limits
✓ User limits
✓ Usage metrics
✓ Customer administration
```

Do not over-invest in SaaS billing before the ERP's core business workflows are proven.

---

# 28. V1 Scope

Keep the first production release focused.

```text
PLATFORM
├── Multi-tenancy
├── Authentication
├── RBAC
└── Audit

MASTER DATA
├── Customers
├── Products
└── Tax

SALES
├── Quotations
├── Sales Orders
├── Delivery
├── Invoices
└── Payments

INVENTORY
├── Warehouse
├── Stock
└── Movements

FINANCE
├── Accounts
├── Journal
└── Basic Ledger

DASHBOARD
└── Core KPIs
```

This is already a genuine ERP product.

---

# 29. Production Readiness Checklist

The V1 release should not be considered production-ready until:

```text
[ ] Tenant isolation tested
[ ] RLS policies enabled and forced on all tenant-owned tables
[ ] Authentication tested
[ ] Session revocation + refresh-token rotation tested
[ ] RBAC tested
[ ] Database migrations reproducible
[ ] Backup and restore tested
[ ] Audit logging operational
[ ] API documented
[ ] Error handling standardized
[ ] Financial transactions protected
[ ] Idempotency tested on payment / bank endpoints
[ ] Document sequence concurrency tested (no duplicates under parallel posting)
[ ] Inventory movements auditable
[ ] PDF generation reliable
[ ] Document file versioning verified (regeneration creates new version)
[ ] Email notifications reliable
[ ] Dead-letter queue surfaced and monitored
[ ] Web build tested
[ ] Desktop build tested
[ ] Mobile build tested
[ ] Automated CI passing
[ ] Staging environment working
[ ] Production monitoring working
[ ] Security review completed
[ ] Performance/load testing completed for critical endpoints
[ ] Database indexes reviewed for major queries
[ ] Disaster recovery procedure documented
[ ] Seeds reproducible (chart of accounts, tax, UoM, demo tenant)
```

---

# 30. Recommended Implementation Dependency Graph

```text
                    Authentication
                           ↓
                    Multi-tenancy
                           ↓
                     Organization
                           ↓
                  Users / RBAC
                           ↓
                     Master Data
                  ┌────────┴────────┐
                  ↓                 ↓
                 CRM              Products
                  │                 │
                  └────────┬────────┘
                           ↓
                         Sales
                           ↓
              ┌────────────┴────────────┐
              ↓                         ↓
         Inventory                  Finance
              │                         │
              └────────────┬────────────┘
                           ↓
                       Dashboard
```

The idempotency (§16a), sequence (§12), and RLS (§7) mechanisms are platform concerns and are built in Phase 0–1, before any node in this graph.

---

# 31. First Technical Deliverable

Before implementing the full ERP, produce these four artifacts for V1:

```text
1. PostgreSQL ERD
   ├── Tables
   ├── Columns
   ├── Foreign keys
   ├── Indexes
   ├── Constraints
   └── RLS policies
       ├── document_sequences   (mandatory, per §12)
       ├── sessions             (per §24)
       ├── idempotency_keys     (per §16a)
       ├── mobile_uuid columns  (per §11)
       ├── document_files       (per §23)
       └── chart-of-accounts seed model (per §3)

2. REST API Specification
   ├── Endpoints
   ├── Request DTOs
   ├── Response DTOs
   ├── Errors
   ├── Permissions
   └── Idempotency-Key contract (§16a)

3. Flutter Screen / Route Map
   ├── Web/Desktop routes
   ├── Mobile routes
   ├── Forms
   ├── Tables
   └── Dashboard

4. End-to-End Workflow Specification
   Customer
      → Quote
      → Order
      → Delivery
      → Invoice
      → Payment
      → Accounting
```

These should become the source of truth for development.

---

# 32. Core Principle

The ERP should not be designed as:

```text
A collection of CRUD modules
```

It should be designed as:

```text
Platform
  +
Shared Master Data
  +
Business Workflows
  +
Accounting/Inventory Invariants
  +
Permissions
  +
Auditability
  +
Tenant Isolation
```

That architecture will make Finance, HR, Inventory, Procurement, CRM and future modules plug into the same reliable foundation instead of becoming independent mini-applications.

---

# 33. Immediate Build Order

The recommended implementation order is:

```text
STEP 01
Repository + Docker + CI
        ↓
STEP 02
PostgreSQL + migrations
        ↓
STEP 03
Authentication
        ↓
STEP 04
Multi-tenancy
        ↓
STEP 05
Users + RBAC
        ↓
STEP 06
Organization
        ↓
STEP 07
Customers + Products
        ↓
STEP 08
Quotation
        ↓
STEP 09
Sales Order
        ↓
STEP 10
Delivery
        ↓
STEP 11
Invoice
        ↓
STEP 12
Payment
        ↓
STEP 13
Inventory movements
        ↓
STEP 14
Accounting entries
        ↓
STEP 15
Dashboard
        ↓
STEP 16
Security + E2E testing
        ↓
STEP 17
Staging deployment
        ↓
STEP 18
Production V1
```

Idempotency, sequence allocation, RLS, and sessions are delivered inside Steps 03–05 (platform foundation), not deferred to their consuming modules.

The objective is to make the first release a complete, secure **order-to-cash ERP workflow**, while keeping the architecture ready for Procurement, HR, Payroll, advanced Finance, CRM and SaaS billing.
