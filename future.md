# ERP_SAAS — Remaining Implementation Roadmap

> **Maintenance convention:** when a phase is fully implemented (all steps plus verification passed), **remove its section from this file** and update the status map / build order below to reflect the current state. A phase only disappears once it no longer has outstanding work here.

> **Test policy (team decision, 2026-09-18):** skip running tests (unit + e2e) for the remainder of development. Verification is done via `tsc --noEmit` typecheck, `flutter analyze`, and build. Authored specs stay in the repo for later CI but are not executed as part of development regression.

> Working document for everything after Phases 0–2 (Platform Foundation + CRM/Master Data), which are **complete**. Phases 3–9 backend + Flutter are all shipped (per the phase banners below); the remaining work is G-4 demo fixtures/seeds, G-7 suite execution (kept for CI per the test policy), and the **M9 / V1 production-readiness audit** (checklist at the end).
> Source of truth: `ERP_Implementation_Plan_V2.md`. Conventions are binding: UUID PKs, `tenant_id` on every owned table with RLS **enabled + FORCED**, `created_at`/`updated_at` TIMESTAMPTZ, snake_case `@map`, state-machine endpoints (never `PATCH status=`), Idempotency-Key on every mutating endpoint, tenant-scoped uniqueness, parameterized raw SQL for sequences/ledger/stock queries.

Current status map / build order (from plan §30, §33):

M0 cross-cutting platform gaps: **G-1 ✓ / G-2 ✓ / G-3 ✓ / G-6 ✓ done** (M0), **G-7 in progress** (harness + specs: auth, tenant-isolation, idempotency, sales-flow/Phase 3, inventory-flow/Phase 4 — the two debug progress-specs were removed). **Phase 3 invoice-post 500 / payment-capture 400 root-caused and FIXED** — document `number` uniqueness was global across tenants (per-tenant now), and the gapless `INSERT` bound `tenant_id` as text into a `uuid` column and omitted `updated_at` (both fixed). `sales-flow.e2e-spec.ts` now 7/9 green; the 2 red are 60s→180s **timeout-only** (Neon latency), no assertion failures; **not re-run since the timeout raise**. **G-4 IMPLEMENTED (code)** — permissions + COA seeded and applied; tax rates/units/default roles (Admin/Sales/Inventory/Finance) + idempotent demo fixture now ship in `seed.ts`, pending live-DB apply/verify (see G-4 section), **G-5 ✓ done** (Flutter scaffold + all feature-phase screens), **G-8 ✓ done** (122 permission codes). **Phase 4: migration + seed applied, module shipped, `inventory-flow` e2e authored, spec defect fixed, not yet executed** (see the Phase 4 banner). **Phase 6 (Procurement): COMPLETE** — backend shipped and `procurement-flow.e2e-spec.ts` GREEN 12/12 on Neon (migration `20260918000000_phase6_procurement`, six modules under `apps/api/src/procurement/`, FinanceService AP posting). Flutter `features/procurement/` shipped (6 screens + repository/providers, routes under `/app/procurement/*`, dashboard nav; `flutter analyze` clean, 8 widget tests green). **Phase 7a (HR Master): COMPLETE** — migration `20260919000000_phase7a_hr_master` + seed applied (Department/Employee/Attendance/LeaveType/Leave, RLS ENABLE+FORCE, 8 new `hr.*` codes — 103 total); five modules under `apps/api/src/hr/` (departments, employees, attendance+punch, leave-types, leaves with submit/approve/reject/cancel + `/leaves/mine` self-service); Flutter `features/hr/` shipped (5 screens, routes under `/app/hr/*`, dashboard "People (HR)" nav). Verified via `tsc --noEmit` + `flutter analyze` (tests skipped per team policy). **Phase 7b (Payroll): COMPLETE** — migration `20260920000000_phase7b_payroll` applied (SalaryStructure/PayrollRun/Payslip, RLS ENABLE+FORCE, tenant FK on Payslip, `@@unique([tenantId, periodStart, periodEnd])`); seed re-run (7 new `hr.*` codes + COA 2104/2105 → **110 permission codes total**, COA for 23 tenants; seed txn timeout bumped 120s→600s for Neon). Three modules added under `apps/api/src/hr/` (salary-structures CRUD, payroll-runs create/calculate/approve/post/reverse with `PR-YYYY-MM` numbering and FinanceService `postPayrollRun` → Dr 5201 / Cr 2104+2105, payslips list + queue/download); worker `payslip-pdf.renderer.ts` routes `PAYSLIP` through the existing pdf queue; Flutter `features/hr/` extended (Salary Structures + Payroll runs list/detail with calculate/approve/post/reverse + per-payslip PDF generate/download via `ApiClient.downloadBytes` + conditional-import saver). Verified via `tsc --noEmit` (`@erp/api`, `@erp/worker`) + `flutter analyze` + `flutter build windows --debug` (tests skipped per team policy). **Deliberate schema drifts from the 7b spec:** `PayrollRun.number` is `@@unique([tenantId, number])` (per-tenant, from periodStart UTC, derived `PR-YYYY-MM`, immutable on reversal) not global-unique; `Payslip` carries a tenant FK + RLS and no `pdfVersion` pointer (latest PDF = latest `document_files` GENERATED row, `documentType=PAYSLIP`); `Payslip` also indexes `[tenantId, payrollRunId]` and tracks `updatedAt`. Approve requires both `hr.payroll.approve` + `hr.payroll.run` (PermissionsGuard AND semantics). Payslip email delivery deferred to Phase 8 (EmailProcessor). **Phase 8 (Operations + Dashboard): COMPLETE** — migration `20260921000000_phase8_operations` + seed applied (Project/ProjectTask/ApprovalRequest/Notification/NotificationPreference, RLS ENABLE+FORCE, 9 new `ops.*` codes); four modules under `apps/api/src/ops/` (projects, tasks, approvals with approve/reject, notifications with read-all) + dashboard endpoints (KPIs, sales-trend); Flutter `features/ops/` shipped (Projects, Tasks, Approvals, Notifications, dashboard KPI cards + hand-rolled revenue trend chart, routes under `/app/ops/*`, dashboard "Operations" nav). Verified via `tsc --noEmit` + `flutter analyze` + `flutter build` (tests skipped per team policy). **Phase 9 (SaaS): COMPLETE** — migration `20260922000000_phase9_saas` + seed (3 new `platform.*` codes — **122 permission codes total**; 5 seed plans under `SUBSCRIPTION_PLANS`); new `apps/api/src/saas/` module (plans, subscription get/change/cancel, async billing checkout → worker + provider webhook, usage limits/current, operator admin gated by `BILLING_ADMIN_TOKEN`); `apps/worker/src/billing/` provider-agnostic `BillingProvider` behind the `billing` BullMQ queue + `MockBillingProvider`, plus `apps/worker/src/usage-meter/` (6h repeatable aggregation); registration auto-creates a 14-day trial subscription + `trial_created` event; user invites enforce plan limits via `SaasAssertionsService`; Flutter `features/settings/` shipped (Subscription + Plans screens, routes under `/app/settings/*`, dashboard "Settings" nav). Verified via `tsc --noEmit` (`@erp/api`, `@erp/worker`) + `flutter analyze` + `flutter build apk --debug` (tests skipped per team policy). Deliberate drift from the Phase-9 spec: single active subscription per tenant via `@@unique([tenantId, planCode])` (plan change = in-place update, worker-applied on webhook); usage metrics worker-aggregated per tenant/period, surfaced live by the usage endpoint. **Remaining:** G-4 demo fixtures + seed completion, G-7 suite execution, and the M9 / V1 production-readiness audit (checklist at the end). **NOTE:** Phase 9 (SaaS) is only in the working tree — not yet committed.

```text
[DONE] Phases 0–2 → 3 Sales → 4 Inventory → 5 Finance → 6 Procurement → 7a HR → 7b Payroll → 8 Operations → 9 SaaS
(all product phases code-complete; Phase 9 awaiting commit; M9 V1 audit remaining)
```

Sequencing dependencies that matter for implementations:

```text
Phase 3 Sales ✓ COMPLETE ── depends on ──>  warehouses + stock_balances (minimal, from Phase 4)
Phase 4 Inventory ✓ COMPLETE ── depends on ──> Phase 3 deliveries (sales → stock out)
Phase 5 Finance ✓ COMPLETE ── depends on ──> Phase 3 payments/invoices (posting)
Phase 6 Procurement ✓ COMPLETE ── depends on ──> vendors (new), warehouse, finance bill posting
Phase 7a HR Master ✓ COMPLETE ── depends on ──> users (identity) for employee<->user link
Phase 7b Payroll ✓ COMPLETE ── depends on ──> 7a + PDF worker + seeded COA + reversal discipline
Phase 8 Operations ✓ COMPLETE ── depends on ──> notifications worker (BullMQ) + approvals primitive
Phase 9 SaaS ✓ COMPLETE ── depends on ──> core workflows proven (billing model stable)
```

---

## Cross-cutting platform gaps (do FIRST — unblock every phase)

These are not "phases" but blockers that all remaining phases inherit. **G-1, G-2, G-3 and G-6 were closed during M0** — the remaining ones (G-4, G-5, G-7, G-8) should be closed before or alongside Phase 3.

### G-1. Sequence service (plan §12) — ✓ DONE (M0)

- `apps/api/src/common/database/document-numbering.service.ts` + `DatabaseInfraModule`, registered in `app.module.ts`.
- API: `allocateNumber(tenantId, docType, financialYear) -> { number, rawSeq }`; format `PREFIX-YYYY-NNNNNN`.
- Gapped (default) via PostgreSQL sequence; **gapless** for statutory documents via counter row with `ON CONFLICT DO UPDATE … RETURNING` inside the caller's transaction (row-locked), retry on `40001`/`23505`.
- Numbers assigned at **post/issue** time; drafts carry `number = null`.
- RLS `ENABLE + FORCE` on `document_sequences` verified (migration present); service throws a descriptive error if no armed RLS row is returned (zero rows).
- 11 passing unit tests (gapped/gapless, lock, retry, empty-tenant).
- Remaining (deferred): parallel-allocation concurrency e2e for gapless contiguity → tracked under G-7.

### G-2. `document_files` table + PDF worker (plan §23) — ✓ DONE (M0)

- Prisma model matches the spec: `documentType`, `version`, `status` PENDING|GENERATED|FAILED, `storageKey`, `checksum`, `mimeType`, unique `(tenantId, documentType, documentId, version)`.
- Migration `20260914163606_document_files` applied to the live DB: RLS `ENABLE + FORCE` + tenant policy (also fixed pre-existing drift — `updated_at` DROP DEFAULT, index renames).
- Storage key pattern `{tenant}/{documentType}/{documentId}/{version}.pdf` via `buildKey` in the worker's `DocumentFileService` (S3 keys, immutable, never overwritten).
- Worker `PdfProcessor` renders via pdfkit → persists `DocumentFile` row → uploads object through `StorageService` (S3 provider from G-3).
- Retries/dead-lettering wired per §22 (`attempts` + backoff → `pdf-dlq`; bounded close in the dead-letter service).
- Regeneration = new `version` row (same key pattern). Regeneration **endpoint** itself deferred to the real document modules (incl. PAYSLIP template under 7b) — out of M0.

### G-3. S3 storage provider (plan §23) — ✓ DONE (M0)

- `packages/storage`: `StorageService` facade + `S3StorageProvider` (`putObject`, `getSignedUrl` presigned GET, `deleteObject` used for best-effort orphan cleanup) + existing `LocalDiskProvider`; module factory constructs **only the selected driver** (falls back to local unless `STORAGE_DRIVER=s3`).
- API's duplicated `apps/api/src/storage/` removed; API + worker import `StorageModule` from `@erp/storage`.
- Config via `@erp/config` — **naming decision (deliberate drift from plan):** unified `STORAGE_*` prefix instead of `S3_*` → `STORAGE_DRIVER`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`.

### G-4. Seeds & fixtures (plan §3) — IMPLEMENTED (code); apply + verify pending

System reference data and the demo fixture now ship as code under `database/src/system/` + `database/src/fixtures/demo.ts` and are wired into `prisma db seed` (idempotent):

- `database/src/system/chart-of-accounts.ts` — standard COA (Asset/Liability/Equity/Revenue/Expense), shipped with Phase 5. Applied on Neon.
- `database/src/system/tax-rates.ts` (`seedTaxRates`) — standard VAT/GST set (NONE/EXEMPT/ZERO/VAT-SR/VAT-RD/GST).
- `database/src/system/units.ts` (`seedUnits`) — base UoM set (PCS/BOX/KG/G/L/ML/M/CM/HRS/DAY) with base-unit conversions.
- `database/src/system/default-roles.ts` (`seedDefaultRoles`) — default roles beyond Owner (which is created at registration): **Admin** (all non-platform), **Sales**, **Inventory**, **Finance** — each carrying a domain permission subset.
- `database/src/fixtures/demo.ts` (`seedDemoFixture`) — idempotent demo tenant (`slug=demo`, trial→starter subscription): company + HQ branch, seeded COA/tax/units/roles, 4 customers + primary contacts, 6 products (2 categories), and 5 users (`owner@/admin@/sales@/finance@/warehouse@demo.erp`, password `Demo1234!`). Sample documents are deliberately **not** fixture-created — they must go through the service layer (numbering/stock/ledger); e2e flows cover those.

`seed.ts`'s per-tenant loop now arms the tenant GUC once and seeds COA + tax rates + units + default roles in one transaction. `npm run test` typecheck passes (`prisma validate` + `tsc`). **Pending:** run `prisma db seed` against the live/CI DB and verify the demo login + role assignment end-to-end (applies under M9 / staging).

### G-5. Flutter scaffold + API client (plan §4, §24) — ✓ DONE

The Flutter client is no longer placeholder — auth + API client shipped (commit `18101cf`), and every feature phase has real screens.

- `core/network/` — Dio-based `ApiClient`: base URL, global `/api/v1`, `{ data, meta? }` envelope parser, `{ error }` unwrap, 401 refresh interceptor, `Idempotency-Key` header support (`core/network/idempotency.dart`).
- `core/auth/` — `AuthRepository` (login/register/logout/refresh/me), `SessionController` + `AuthProviders` (Riverpod codegen), `TokenStore` with secure storage for the refresh token, guarded router (`/app` requires session; login/register screens in `features/auth/`).
- Feature screens shipped for every phase: `features/{sales,inventory,finance,procurement,hr,ops,settings}` + dashboard wired to the real KPI endpoint (`features/dashboard/`).
- Verified via `flutter analyze` + builds (tests skipped per team policy).

### G-6. Worker processors real implementations — ✓ DONE (M0)

- API producers behind a `@Global` `JobsModule`: `notifications.job.service.ts` + `documents.job.service.ts`, queue names `pdf`/`email`, DLQ `pdf-dlq`/`email-dlq` (constants in `jobs.constants.ts`).
- Everything queued with `attempts` + backoff; exhausted → dead-letter queue (`dead-letter.service.ts`, bounded close).
- Worker real implementations: `PdfProcessor` (render → persist → upload) and `EmailProcessor` behind a `MailProvider` interface (log mailer for dev).
- No provider SDKs called from app code — always via the job/queue boundary.

### G-7. E2E test harness (plan §25) — IN PROGRESS (harness + 8 specs authored, teardown resolved)

`apps/api/test/jest-e2e.json` fixed (moduleNameMapper → `../../`, `testTimeout: 180000`); **eight specs authored**: auth, tenant-isolation, idempotency, sales-flow (P3), inventory-flow (P4), finance-flow (P5), procurement-flow (P6). Per the team test policy (top of file) specs are kept for CI and not run as a dev regression.

- Shared helpers in `e2e-helpers.ts`: `createTestApp` (mirrors production boot minus helmet/swagger/cors), `registerTenant`, `cleanupTenant` (FK-ordered, per-step timeboxed, extended with Phase-3 + Phase-4 tables), `closeTestApp` (bounded queue closes).
- **Teardown hang resolved** — bounded BullMQ/Redis close in `closeTestApp` confirmed on the auth/tenant-isolation/idempotency specs (they exit cleanly with `--forceExit` no longer required by default).
- Mandatory security test implemented: **Tenant A user requests Tenant B resource → 403/404, no data leaked.** Repeat for every tenant-owned resource as modules land.
- Phase-3 happy-path suite live (`sales-flow.e2e-spec.ts`): quote → order → delivery → invoice → payment, gapless document numbers, oversell rejection, allocation guard. **Status: 7/9 green** — order/delivery fixed (route mismatch + `withTenant` GUC breach inside tx callbacks + sequence DO-block param bug), then invoice-post 500 + payment-capture 400 root-caused and fixed (document `number` was globally unique across tenants → per-tenant `@@unique([tenantId, number])`; gapless `allocateGapless` bound `tenant_id` as text into a `uuid` column and omitted `updated_at` — fixed with `::uuid` + `updated_at = now()`). The remaining 2 red are **timeout-only** (60s→180s on Neon latency), no assertion failures.
- Phase-4 suite authored (`inventory-flow.e2e-spec.ts`): warehouse CRUD, adjustments, transfers, stocktake, ledger, low-stock, idempotent replay, cross-tenant isolation. **Spec defect fixed this pass:** the idempotent-replay test asserted a `201` replay and whole-body equality, contradicting the interceptor's documented replay contract (`200` + `meta.replayed`); now asserts `200`, `body.data` equality, `meta.replayed === true`, and single-movement invariant. **Suite not yet executed** (needs REDIS_URL reachable + Neon).
- Remaining: G-1 sequence-concurrency tests (gapless contiguity), idempotency double-submit checks (partially covered — interceptor `::uuid`/`::"IdempotencyStatus"` casts fixed), RLS bypass tests (`$queryRaw` from another tenant = empty), then execute + green the sales-flow re-run and the inventory-flow suite.

### G-8. New permission codes — central catalog — ✓ DONE

All phase additions are seeded (`database/prisma/seed.ts`, **122 codes** across `sales.*`, `finance.*`, `inventory.*`, `procurement.*`, `hr.*`, `ops.*`, `platform.*`). Future additions keep the lowercase dotted `group.subgroup.verb` convention in the same file.

---

# PHASE 3 — SALES (quote → order → delivery → invoice → payment)

> **STATUS — backend implemented; e2e 7/9 green.** Prisma models + migrations, permissions (seed → 65 codes), and all six modules (quotations, orders, deliveries, invoices, payments, bank-accounts) with `withTenant`-armed RLS transactions are in place. `sales-flow.e2e-spec.ts` covers the full happy path + oversell rejection + payment-balance guard. **Closed this pass:** invoice-post 500 + payment-capture 400 root-caused — (1) `Quotation|SalesOrder|Delivery|Invoice|Payment.number` were globally `@unique` while each tenant's sequence restarts at 1 → `P2002`; fixed by `@@unique([tenantId, number])` (migration `20260916120000_scope_document_numbers_per_tenant`). (2) gapless `allocateGapless` bound `tenant_id` (uuid) as text (`42804`) and omitted NOT-NULL `updated_at` (`23502`) — fixed with `::uuid` cast + `updated_at = now()`. **Open:** 2 of 9 sales-flow tests exceed 60s on Neon (timeout raised to 180s; not yet re-run). **Closed:** G-5 Flutter and the Phase 3.5 sales screens ARE shipped (`features/sales/`, committed `26199b8`). The Phase 3 section below is the living checklist — items already implemented are struck through/crossed off where verified.

Goal (plan §13, §27 Phase 3): a full sales transaction created, approved, delivered, invoiced, paid and audited. **This is the first end-to-end integration test of the platform.**

## 3.0 Documents lifecycle (shared by all sales docs)

```text
DRAFT → SUBMITTED → APPROVED → POSTED/ISSUED → [DONE]
                          ↘ CANCELLED
```

Transitions are explicit endpoints, each guarded by its own permission. Mutating endpoints accept `Idempotency-Key`. Drafts have no visible document number (G-1 assigns at post).

## 3.1 Prisma schema additions

> **✓ IMPLEMENTED** — `quotations`/`quotation_items`, `sales_orders`/`sales_order_items`, `deliveries`/`delivery_items`, `invoices`/`invoice_items`, `payments`/`payment_allocations`, `bank_accounts` all present in `schema.prisma` with RLS `ENABLE + FORCE`, shipped in a Phase-3 migration and applied to the live Neon DB. Schema drift decisions recorded in PR/migration: `Payment.number` is **nullable** (`String?`) — assigned at capture, not create; `line_total` has `@default(0)` on all three item models (overwritten by `recalcTotals`); deliveries use `deliveredQty` (`delivered_quantity`), NOT `deliveredQuantity`.

```prisma
enum SalesDocStatus { DRAFT SUBMITTED APPROVED REJECTED CONVERTED CANCELLED POSTED PAID PARTIALLY_DELIVERED DELIVERED PARTIALLY_PAID INVOICED }  // per-model subset below

model Quotation {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  number            String?  @unique @db.VarChar(32)                      // assigned at approve/post (G-1)
  customerId        String   @map("customer_id") @db.Uuid
  branchId          String?  @map("branch_id") @db.Uuid
  status            String   @default("DRAFT") @db.VarChar(16)
  currency          String   @default("USD") @db.VarChar(3)
  validUntil        DateTime? @map("valid_until") @db.Timestamptz(6)
  subtotal          Decimal  @default(0) @db.Decimal(18, 4)
  discountTotal     Decimal  @default(0) @map("discount_total") @db.Decimal(18, 4)
  taxTotal          Decimal  @default(0) @map("tax_total") @db.Decimal(18, 4)
  total             Decimal  @default(0) @db.Decimal(18, 4)
  notes             String?  @db.Text
  createdById       String?  @map("created_by_id") @db.Uuid
  approvedById      String?  @map("approved_by_id") @db.Uuid
  approvedAt        DateTime? @map("approved_at") @db.Timestamptz(6)
  mobileUuid        String?  @unique @map("mobile_uuid") @db.Uuid          // offline rule §11
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  customer          Customer @relation(fields: [customerId], references: [id])
  branch            Branch?  @relation(fields: [branchId], references: [id])
  items             QuotationItem[]
  order             salesOrder? (one-to-many via sales_orders.source_quotation_id)
  @@index([tenantId, status])
  @@map("quotations")
}

model QuotationItem {
  id          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String      @map("tenant_id") @db.Uuid
  quotationId String      @map("quotation_id") @db.Uuid
  quotation   Quotation   @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  productId   String?     @map("product_id") @db.Uuid
  description String      @db.Text
  quantity    Decimal     @db.Decimal(18, 4)
  unitId      String?     @map("unit_id") @db.Uuid
  unitPrice   Decimal     @map("unit_price") @db.Decimal(18, 4)
  discountPct Decimal     @default(0) @map("discount_pct") @db.Decimal(5, 2)
  discountAmt Decimal     @default(0) @map("discount_amt") @db.Decimal(18, 4)
  taxRateId   String?     @map("tax_rate_id") @db.Uuid
  taxAmount   Decimal     @default(0) @map("tax_amount") @db.Decimal(18, 4)
  lineTotal   Decimal     @map("line_total") @db.Decimal(18, 4)
  sortOrder   Int         @default(0) @map("sort_order")
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  product     Product?    @relation(fields: [productId], references: [id])
  @@index([tenantId, quotationId])
  @@map("quotation_items")
}
```

`sales_orders` / `sales_order_items` — mirror `quotations`, plus:

```prisma
  sourceQuotationId String?  @map("source_quotation_id") @db.Uuid
  expectedDeliveryDate DateTime? @map("expected_delivery_date") @db.Timestamptz(6)
  status String @default("DRAFT")  // DRAFT|SUBMITTED|APPROVED|PARTIALLY_DELIVERED|DELIVERED|CANCELLED
```

`deliveries` / `delivery_items` — mirror order, plus:

```prisma
  salesOrderId String   @map("sales_order_id") @db.Uuid
  warehouseId  String?  @map("warehouse_id") @db.Uuid   // FK → warehouses (Phase 4 table)
  deliveryDate DateTime? @map("delivery_date") @db.Timestamptz(6)
  status       String   @default("DRAFT")  // DRAFT|SUBMITTED|DELIVERED|CANCELLED
```

Delivery posting decrements stock: emit `SALE` stock movements (needs Phase-4 table; build `warehouses` + `stock_balances` + `stock_movements` first — see 4.1).

`invoices` / `invoice_items` — mirror order, plus:

```prisma
  salesOrderId String?  @map("sales_order_id") @db.Uuid
  deliveryId   String?  @map("delivery_id") @db.Uuid
  issueDate    DateTime @map("issue_date") @db.Timestamptz(6)
  dueDate      DateTime? @map("due_date") @db.Timestamptz(6)
  paidAmount   Decimal  @default(0) @map("paid_amount") @db.Decimal(18, 4)
  balance      Decimal  @default(0) @db.Decimal(18, 4)
  status       String   @default("DRAFT")  // DRAFT|SUBMITTED|APPROVED|POSTED|PARTIALLY_PAID|PAID|CANCELLED
```

`payments` / `payment_allocations`:

```prisma
model Payment {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  number        String   @unique @db.VarChar(32)                     // G-1, assigned at capture
  customerId    String   @map("customer_id") @db.Uuid
  bankAccountId String?  @map("bank_account_id") @db.Uuid            // FK → bank_accounts (3.1a)
  amount        Decimal  @db.Decimal(18, 4)
  method        String   @db.VarChar(20)                             // CASH|BANK_TRANSFER|CARD|CHEQUE|OTHER
  reference     String?  @db.VarChar(64)
  status        String   @default("PENDING")                         // PENDING|CAPTURED|FAILED|VOID
  paidAt        DateTime? @map("paid_at") @db.Timestamptz(6)
  createdById   String?  @map("created_by_id") @db.Uuid
  mobileUuid    String?  @unique @map("mobile_uuid") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  allocations   PaymentAllocation[]
  @@index([tenantId, customerId, status])
  @@map("payments")
}

model PaymentAllocation {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String  @map("tenant_id") @db.Uuid
  paymentId String  @map("payment_id") @db.Uuid
  invoiceId String  @map("invoice_id") @db.Uuid
  amount    Decimal @db.Decimal(18, 4)
  payment   Payment @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  invoice   Invoice @relation(fields: [invoiceId], references: [id])
  @@index([tenantId, invoiceId])
  @@map("payment_allocations")
}
```

3.1a **`bank_accounts`** (payment dependency — full finance features in Phase 5):

```prisma
model BankAccount {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  name           String   @db.VarChar(255)
  accountNumber  String?  @map("account_number") @db.VarChar(64)
  accountName    String?  @map("account_name") @db.VarChar(255)   // GL account for posting
  currency       String   @default("USD") @db.VarChar(3)
  openingBalance Decimal  @default(0) @map("opening_balance") @db.Decimal(18, 4)
  isActive       Boolean  @default(true) @map("is_active")
  // Phase 5 adds: bank_transactions relation
}
```

All new tables get RLS `ENABLE + FORCE` with `tenant_id = current_setting('app.current_tenant_id', true)`.

## 3.2 API endpoints

> **✓ IMPLEMENTED** — modules under `apps/api/src/sales/{quotations,orders,deliveries,invoices,payments,bank-accounts}` with controller/service/DTO, guarded by `@RequirePermissions`, `Idempotency-Key` on every mutating endpoint, and state-machine transitions as dedicated endpoints. **Route note:** orders controller is `@Controller('sales-orders')`. Number assignment: quotation `QTO-`/order `SO-`/delivery `DEL-` at approve/post (gapped sequence), invoice `INV-` at post and payment `PAY-` at capture (gapless counter row). Delivery post decrements stock via `INSERT … ON CONFLICT DO UPDATE` with oversell rejection. Invoice PDF is generated via the separate `POST /invoices/:id/pdf` (DocumentsJobService) — **not** at post (deliberate).

New module folders: `apps/api/src/sales/{quotations,orders,deliveries,invoices,payments}` — each with controller/service/dto. Payment endpoints **must** be idempotent (G-1 note in §16a: "Payments must be covered by idempotency before Phase 3 ships").

```text
# Quotations
GET    /quotations?page=&limit=&q=&status=
GET    /quotations/:id
POST   /quotations                      (Idempotency-Key)
PATCH  /quotations/:id                  (DRAFT only)
POST   /quotations/:id/submit
POST   /quotations/:id/approve          (assigned: quotation number via G-1)
POST   /quotations/:id/reject
POST   /quotations/:id/convert          (→ Sales Order, one tx, cascade items)
POST   /quotations/:id/cancel           (only DRAFT/SUBMITTED)

# Sales Orders
GET    /sales-orders?page=&limit=&q=&status=
GET    /sales-orders/:id
POST   /sales-orders                    (Idempotency-Key; also from convert)
PATCH  /sales-orders/:id                (DRAFT only)
POST   /sales-orders/:id/submit
POST   /sales-orders/:id/approve        (assigned: SO number)
POST   /sales-orders/:id/cancel

# Deliveries
GET    /deliveries?page=&limit=&q=&status=
GET    /deliveries/:id
POST   /deliveries                      (from sales order, Idempotency-Key)
POST   /deliveries/:id/submit
POST   /deliveries/:id/post             (→ stock-out movements + delivery number)

# Invoices
GET    /invoices?page=&limit=&q=&status=&customer_id=
GET    /invoices/:id
POST   /invoices                        (from order/delivery, Idempotency-Key)
PATCH  /invoices/:id                    (DRAFT only)
POST   /invoices/:id/submit
POST   /invoices/:id/approve
POST   /invoices/:id/post               (→ invoice number + Finance entry, Phase 5)
POST   /invoices/:id/cancel

# Payments
GET    /payments?page=&limit=&customer_id=
GET    /payments/:id
POST   /payments                        (Idempotency-Key — mandatory)
POST   /payments/:id/capture            (single tx: allocation to invoices, balance math, payment number)
POST   /payments/:id/void               (only if nothing posted downstream)

# Bank accounts
GET    /bank-accounts
POST   /bank-accounts                   (Idempotency-Key)
```

## 3.3 Permission codes (add to seed)

> **✓ IMPLEMENTED** — all Phase-3 codes added to `database/prisma/seed.ts`; seed now reports **57 permission codes** (run + verified on Neon).

```text
sales.quote.view|create|edit|approve|cancel        // already seeded — reuse
sales.order.view|create|approve                     // seeded
sales.order.edit                                    // NEW
sales.order.cancel                                  // NEW
sales.delivery.view|create                         // NEW
sales.delivery.post                                 // NEW
sales.invoice.view|create|approve|post             // seeded
sales.invoice.edit|cancel                           // NEW
sales.payment.view|create                          // NEW
sales.payment.capture|void                          // NEW
finance.bank-account.view|edit                      // NEW (shared)
```

## 3.4 Worker / async jobs

> **PARTIAL** — PdfProcessor/EmailProcessor + queue producers ship with G-2/G-6 (M0). Invoice PDF generation is wired via `InvoicesService.queuePdf` → `DocumentsJobService.queuePdf` behind `POST /invoices/:id/pdf`; PaymentsService deliberately does not enqueue PDFs (deferred). Email "invoice posted" event stub not yet added.

- **PdfProcessor:** consume `INVOICE_GENERATE` jobs → render invoice PDF → `document_files` version 1 → S3 → notify.
- Queue producers added in `InvoicesService.post()` and `PaymentsService.capture()`.
- Email rule: invoice posted → notification event (Phase 8 table; stub producer now).

## 3.5 Flutter features (`features/sales/`)

> **✓ SHIPPED** (commit `26199b8`) — no longer blocked on G-5.

- `quotations/` list + form + detail with state action buttons — shipped (`quotations_page.dart`).
- `orders/`, `deliveries/`, `invoices/`, `payments/`, `bank-accounts/` — shipped, sharing `sales_widgets.dart` for the doc header + line-items table editor.
- Payment entry screen includes the invoice-allocation picker (open invoices + outstanding balance) via `payments_page.dart` `_allocate` → `capturePayment(allocations: …)`.

## 3.6 Tests

> **IN PROGRESS** — `sales-flow.e2e-spec.ts` added (customer → quote → order → delivery → invoice → payment, direct-Prisma warehouse seed, oversell + allocation-guard assertions). **Status: 7/9 green** — quotation through payment all assert correctly; the 2 red are timeout-only (Neon latency under a 60s budget; `testTimeout` raised to 180s, suite **not re-run since**). The invoice-post 500 (global `number` uniqueness → per-tenant) and payment-capture 400 (gapless `INSERT` text→uuid + missing `updated_at`) root causes are FIXED in code and covered by the passing 7.

- E2E happy path: customer → quote → order → delivery → invoice → payment, assert document numbers sequential.
- Stock-out movement check on delivery post (integration).
- Invoice balance math + payment allocation correctness.
- State-transition matrix (invalid transitions → 409/`INVALID_TRANSITION`).
- Cross-tenant: attempt loading Tenant B invoice → 403/404.
- Idempotent double-submit of payment returns stored response, single allocation.

### Definition of Done

Full sales transaction created → approved → delivered → invoiced → paid and audited; payments idempotent; invoice/order/delivery numbers via §12 sequence, no duplicates.
**Current:** backend + schema + permissions done; sales-flow e2e 7/9 green with the 2 reds fixed-in-code and pending a timeout-raised re-run (180s); G-5 Flutter sales screens remain for the full phase.

---

# PHASE 4 — INVENTORY (warehouse → stock → movements)

> **STATUS — shipped; e2e authored (spec defect fixed), not yet executed.** `warehouses` / `stock_balances` / `stock_movements` shipped with Phase 3 (M1); Phase 4 adds `batches` + `serial_numbers` (migration `20260916020000_phase4_inventory_tracking`, RLS FORCED), the `apps/api/src/inventory/` module (`warehouses`, `stock`, `stock-ledger`), 8 new permission codes (seed → 65 total), `apps/api/sql/stock.sql` documentation, and the `inventory-flow.e2e-spec.ts` suite (adjust/transfer/stocktake/ledger/low-stock/idempotent-replay/cross-tenant). Delivery posting now delegates stock-out to the shared `StockLedgerService`. **Fixed this pass:** the spec's idempotent-replay test claimed a 201 replay + whole-body equality, contradicting the interceptor's replay contract (200 + `meta.replayed`) — now asserts `200` + `body.data` equality + `meta.replayed`. **Open:** migration + seed ARE applied to the live DB; the `inventory-flow` e2e suite has **not been executed yet** (run `npm.cmd run test:e2e -w @erp/api` with REDIS_URL reachable).

Goal (plan §14, §27 Phase 4): every quantity change has an auditable movement reference. **Stock is a derived ledger, never a mutable column.**

## 4.1 Prisma schema additions

> **✓ IMPLEMENTED** — `Warehouse`/`StockBalance`/`StockMovement` shipped with the Phase-3 migration; `Batch`/`SerialNumber` added in `20260916020000_phase4_inventory_tracking` (RLS `ENABLE + FORCE` + policy). `stock_movements.unit_cost` added for future costing. `reservedQty` stays 0 until a reservation design lands (V1 §28 = warehouse/stock/movements subset).

```prisma
model Warehouse {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  branchId  String?  @map("branch_id") @db.Uuid
  code      String   @db.VarChar(32)
  name      String   @db.VarChar(255)
  address   Json?
  isActive  Boolean  @default(true) @map("is_active")
  @@unique([tenantId, code])
  @@map("warehouses")
}

model StockBalance {
  warehouseId String  @map("warehouse_id") @db.Uuid
  productId   String  @map("product_id") @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  quantity    Decimal @default(0) @db.Decimal(18, 6)      // on hand
  reservedQty Decimal @default(0) @map("reserved_quantity") @db.Decimal(18, 6)
  @@id([warehouseId, productId])
  @@index([tenantId, productId])
  @@map("stock_balances")
}

enum MovementType { PURCHASE SALE TRANSFER_IN TRANSFER_OUT ADJUSTMENT RETURN DAMAGE STOCKTAKE }

model StockMovement {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String       @map("tenant_id") @db.Uuid
  productId   String       @map("product_id") @db.Uuid
  warehouseId String       @map("warehouse_id") @db.Uuid
  quantity    Decimal      @db.Decimal(18, 6)            // signed; base-unit quantity
  type        MovementType
  referenceType String?    @map("reference_type") @db.VarChar(32)  // DELIVERY, PO, ADJUSTMENT...
  referenceId String?      @map("reference_id") @db.Uuid
  reason      String?      @db.Text
  unitCost    Decimal?     @map("unit_cost") @db.Decimal(18, 4)
  balanceAfter Decimal     @map("balance_after") @db.Decimal(18, 6)
  createdById String?      @map("created_by_id") @db.Uuid
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([tenantId, productId, warehouseId, createdAt])
  @@index([tenantId, referenceType, referenceId])
  @@map("stock_movements")
}

model Batch {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  productId   String   @map("product_id") @db.Uuid
  batchNo     String   @map("batch_no") @db.VarChar(64)
  expiryDate  DateTime? @map("expiry_date") @db.Timestamptz(6)
  manufacturedDate DateTime? @map("manufactured_date") @db.Timestamptz(6)
  quantityRemaining Decimal @default(0) @map("quantity_remaining") @db.Decimal(18, 6)
  @@unique([tenantId, productId, batchNo])
  @@map("batches")
}

model SerialNumber {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  productId String   @map("product_id") @db.Uuid
  batchId   String?  @map("batch_id") @db.Uuid
  serialNo  String   @map("serial_no") @db.VarChar(64)
  status    String   @default("IN_STOCK")           // IN_STOCK|SOLD|RETURNED|SCRAPPED
  @@unique([tenantId, productId, serialNo])
  @@map("serial_numbers")
}
```

Core invariant — **stock mutate is ledger-based and atomic** (raw SQL in one tx):

```sql
-- inside a $transaction with (warehouse, product) row FOR UPDATE on stock_balances:
UPDATE stock_balances SET quantity = quantity + :delta WHERE warehouse_id=:w AND product_id=:p RETURNING quantity;
INSERT INTO stock_movements (..., quantity=:delta, balance_after=RETURNED, reference..., created_by=:uid);
```

Levels:

- **On-hand** from `stock_balances.quantity` (denormalized, correct-by-construction via the above).
- **Available** = on-hand − reserved.
- Raw queries documented under `apps/api/sql/` and covered by integration tests.

`mobile_uuid` on `deliveries` (already in 3.1) supports offline delivery capture later.

## 4.2 API endpoints

> **✓ IMPLEMENTED** — `apps/api/src/inventory/` (`warehouses` + `stock` controllers, shared `StockLedgerService`); every mutating endpoint carries `Idempotency-Key`; permissions per 4.3. Route map below matches the code.

```text
GET  /warehouses?page=&q=      POST  /warehouses
GET  /stock?warehouse=&product=&q=                # on-hand/available (window-fn not needed; denormalized)
GET  /stock/serial-numbers?product=&status=
POST /stock/adjustments                           # Idempotency-Key → ADJUSTMENT movement + reason
POST /stock/transfers                             # Idempotency-Key → TRANSFER_OUT + TRANSFER_IN in one tx
GET  /stock/movements?product=&warehouse=&type=&from=&to=   # auditable ledger
GET  /stock/on-hand/low?threshold=                # low-stock list (drives alerts)
POST /stock/takes                                 # STOCKTAKE → adjust to count
```

## 4.3 Permissions (new)

> **✓ IMPLEMENTED** — `inventory.warehouse.view|edit`, `inventory.stock.transfer`, `inventory.stock.movement.view`, `inventory.batch.view|edit`, `inventory.serial.view|edit` added to `database/prisma/seed.ts` (seed → 65 codes).

```text
inventory.warehouse.view|edit
inventory.stock.view          // seeded
inventory.stock.adjust        // seeded
inventory.stock.transfer
inventory.stock.movement.view
inventory.batch.view|edit
inventory.serial.view|edit
```

## 4.4 Worker / async

- Low-stock detection job (scheduled) → produce notification events (Phase 8).
- Serial/batch consumption is transactional in the posting services — batch/serial FIFO policy selectable per product.

## 4.5 Flutter `features/inventory/`

- `warehouses/`, `stock/` (balances table + drill to movements), `adjustments/`, `transfers/`, `movements/` (filterable ledger).

## 4.6 Tests

- Every movement has a valid `reference` link; balance-after invariant holds under parallel postings.
- Oversell prevention test (quantity would go negative → reject).
- Transfer = two movements, one tx, zero net.
- Serial number can't be sold twice.

### Definition of Done

Every inventory quantity change has an auditable movement reference (purchase, sale, return, adjustment, transfer).

---

# PHASE 5 — FINANCE (COA → journal → ledger → reports)

Goal (plan §15, §27 Phase 5): operational transactions generate correct accounting entries; reports reconcile to transaction data. Uses **double entry, immutable after posting, reversals only** (§2 Rule 4). Trial balance/ledger aggregation as documented raw SQL.

## 5.1 Prisma schema additions

```prisma
model AccountGroup {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  parentId   String?  @map("parent_id") @db.Uuid
  name       String   @db.VarChar(100)
  code       String   @db.VarChar(32)
  type       String   @db.VarChar(16)                 // ASSET|LIABILITY|EQUITY|REVENUE|EXPENSE
  isActive   Boolean  @default(true) @map("is_active")
  @@unique([tenantId, code])
  @@map("account_groups")
}

model Account {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  accountGroupId String @map("account_group_id") @db.Uuid
  code        String   @db.VarChar(32)
  name        String   @db.VarChar(255)
  type        String   @db.VarChar(16)                 // same enum as group — normalized here for reports
  isActive    Boolean  @default(true) @map("is_active")
  isSystem    Boolean  @default(false) @map("is_system")   // COA seed rows; protected
  openingDebit Decimal @default(0) @map("opening_debit") @db.Decimal(18, 4)
  openingCredit Decimal @default(0) @map("opening_credit") @db.Decimal(18, 4)
  @@unique([tenantId, code])
  @@map("accounts")
}

model JournalEntry {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  number         String   @unique @db.VarChar(32)      // JE-2026-xxxxx via G-1
  fiscalPeriodId String?  @map("fiscal_period_id") @db.Uuid
  entryDate      DateTime @map("entry_date") @db.Timestamptz(6)
  referenceType  String?  @map("reference_type") @db.VarChar(32)  // INVOICE, PAYMENT, BILL...
  referenceId    String?  @map("reference_id") @db.Uuid
  description    String?  @db.Text
  totalDebit     Decimal  @map("total_debit") @db.Decimal(18, 4)
  totalCredit    Decimal  @map("total_credit") @db.Decimal(18, 4)
  status         String   @default("POSTED") @db.VarChar(16)   // DRAFT|POSTED|REVERSED
  reversedById   String?  @map("reversed_by_id") @db.Uuid
  createdById    String?  @map("created_by_id") @db.Uuid
  postedAt       DateTime? @map("posted_at") @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  lines          JournalEntryLine[]
  @@index([tenantId, entryDate])
  @@map("journal_entries")
}

model JournalEntryLine {
  id            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String       @map("tenant_id") @db.Uuid
  journalEntryId String      @map("journal_entry_id") @db.Uuid
  journalEntry  JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  accountId     String       @map("account_id") @db.Uuid
  debit         Decimal      @default(0) @db.Decimal(18, 4)
  credit        Decimal      @default(0) @db.Decimal(18, 4)
  narration     String?      @db.Text
  reconciled    Boolean      @default(false)
  account       Account      @relation(fields: [accountId], references: [id])
  @@index([tenantId, accountId, journalEntryId])
  @@map("journal_entry_lines")
}

model FiscalPeriod {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  name      String   @db.VarChar(50)
  startDate DateTime @map("start_date") @db.Timestamptz(6)
  endDate   DateTime @map("end_date") @db.Timestamptz(6)
  status    String   @default("OPEN")               // OPEN|CLOSED|LOCKED
  @@unique([tenantId, name])
  @@map("fiscal_periods")
}

model BankTransaction {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  bankAccountId String   @map("bank_account_id") @db.Uuid
  entryDate     DateTime @map("entry_date") @db.Timestamptz(6)
  amount        Decimal  @db.Decimal(18, 4)
  description   String?  @db.Text
  reference     String?  @db.VarChar(64)
  status        String   @default("UNRECONCILED")   // UNRECONCILED|RECONCILED|MATCHED
  journalEntryId String? @map("journal_entry_id") @db.Uuid
  @@map("bank_transactions")
}
```

IMPORTANT: `finance.tax.view|edit` already controls the existing `tax-rates` module; tax-report rows are **derived queries** — no new tables.

### Posting rules (invariants — enforced in service + CHECK constraints)

1. `SUM(debit) = SUM(credit)` per entry (CHECK). Non-zero both or neither per line.
2. Ledger balances computed from journal lines; never stored.
3. Posting inside one `$transaction`, holds `FOR UPDATE` on the fiscal period open/locked status and account rows being touched.
4. Reversal = copy lines with swapped debit/credit + `status=REVERSED` on source, linked via `reversedById`.

## 5.2 API endpoints

```text
# Chart of accounts (COA seeded per G-4)
GET  /accounts?type=&q=&group=      GET /accounts/:id
POST /accounts                      PATCH /accounts/:id        # non-system only
GET  /account-groups

# Journal
GET  /journal-entries?from=&to=&status=
GET  /journal-entries/:id
POST /journal-entries               # manual entries, DRAFT/check-balance first (Idempotency-Key)
POST /journal-entries/:id/post      # validates balance + period open
POST /journal-entries/:id/reverse   # creates reversing entry

# Reports (raw SQL per §1, documented in apps/api/sql/)
GET /reports/trial-balance?from=&to=&account_type=
GET /reports/general-ledger?account_id=&from=&to=&page=
GET /reports/accounts-receivable?as_of=          # aged summary per customer
GET /reports/accounts-payable?as_of=             # per vendor
GET /reports/tax-summary?from=&to=               # by tax rate code
GET /reports/income-statement?from=&to=
GET /reports/balance-sheet?as_of=

# Fiscal periods / bank
GET  /fiscal-periods   POST /fiscal-periods      POST /fiscal-periods/:id/close
GET  /bank-transactions?bank_account_id=         POST /bank-transactions/import (CSV, Idempotency-Key)
POST /bank-transactions/:id/reconcile            POST /bank-transactions/:id/match
```

## 5.3 Permissions (new)

```text
finance.account.view|edit
finance.journal.view|post        // seeded — edit is implicit in create; add:
finance.journal.reverse
finance.report.view
finance.period.view|edit|close
finance.bank.view|edit|reconcile
```

## 5.4 Auto-posting integrations (§15)

- `Invoice.post()` (Phase 3) now, in the same flow, creates the **AR / revenue / output-tax** journal entry.
- `Payment.capture()` creates **bank / AR** entry.
- `Procurement` bill/payment (Phase 6) creates **AP** entries.
- Fail the whole transaction if journaling fails — no orphan operational docs.

## 5.5 Flutter `features/finance/`

- `accounts/` (COA tree), `journal/` (entries + lines editor w/ running balance), `reports/` (trial balance, GL, AR/AP aging, tax), `bank/`.

## 5.6 Tests

- Debits = credits never mismatch; posting to a closed period rejected.
- Invoice→GL integration: correct AR/Revenue/Tax accounts, amounts match invoice.
- Reversal test: balances return to pre-reversal state.
- Trial balance reconciles to journal totals; cross-tenant isolation on raw `$queryRaw` paths.

### Definition of Done

Operational transactions generate correct accounting entries; trial balance & GL reconcile to transaction data.

---

---

# PHASE 8 — OPERATIONS (projects, tasks, approvals, notifications, dashboards) — COMPLETE

> **STATUS — shipped; section folded into the status map above.** Migration `20260921000000_phase8_operations` + seed (9 `ops.*` codes) applied; the four `apps/api/src/ops/` modules (projects, tasks, approvals, notifications) + dashboard endpoints and the Flutter `features/ops/` screens were verified via `tsc --noEmit` + `flutter analyze` + build. No outstanding Phase 8 work remains.

---

# PHASE 9 — SaaS PLATFORM

> **STATUS — COMPLETE.** Backend + worker + Flutter shipped; details folded into the status map above. Migration `20260922000000_phase9_saas` + seed applied; `apps/api/src/saas/` (plans, subscription, billing, usage, admin), worker `billing/` (provider-agnostic `BillingProvider` behind the `billing` BullMQ queue; `MockBillingProvider` for dev — **no provider SDK calls from app code, per G-6**) + `usage-meter/`; registration auto-creates a 14-day trial. **Drifts from the 9.x spec (recorded):** single active subscription per tenant — `Subscription` gains `@@unique([tenantId, planCode])` instead of the plan's `code @unique` + one-row-per-plan assumption, and plan **change = in-place update** applied worker-side on the (mock) webhook rather than a new subscription row; webhook ingestion goes through the `billing` queue consumed by the worker, and the API exposes GET/POST `/billing/sessions`/`/billing/webhook` for the async checkout lifecycle; `GET /subscription` embeds the plan. Operator admin (`/admin/tenants/:id/override-limit` + GET tenants/usage) is gated by the `BILLING_ADMIN_TOKEN` header (env-configured, `@Public()` + manual check — no new global role model), not by a `platform.billing.admin` permission on a user (that code exists only for future per-user reference).

Goal (plan §27 Phase 9): pricing/plans, trials, billing, limits, usage metrics, customer administration. **Defer until core ERP workflows are proven.** The `Subscription` table already exists; extend it.

## 9.1 Prisma schema additions

```prisma
model SubscriptionPlan {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @db.VarChar(80)
  code        String   @unique @db.VarChar(40)         // free|starter|professional|enterprise
  interval    String   @default("MONTHLY")             // MONTHLY|YEARLY
  price       Decimal  @db.Decimal(18, 4)
  currency    String   @default("USD") @db.VarChar(3)
  features    Json     @default("{}")                  // permissions granted by plan
  limits      Json     @default("{}")                  // { "users": 10, "storage_gb": 5, ... }
  isActive    Boolean  @default(true) @map("is_active")
  @@map("subscription_plans")
}

model UsageMetric {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  metric     String   @db.VarChar(50)                  // users|documents|storage_mb|api_calls
  value      Decimal  @db.Decimal(18, 4)
  recordedAt DateTime @default(now()) @map("recorded_at") @db.Timestamptz(6)
  @@index([tenantId, metric, recordedAt])
  @@map("usage_metrics")
}

model BillingEvent {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  eventType   String   @map("event_type") @db.VarChar(50)   // trial_created|subscription_changed|charge_succeeded|limit_reached
  payload     Json
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([tenantId, createdAt])
  @@map("billing_events")
}
```

Extend the existing `Subscription` model as needed: `planCode String? @map("plan_code")`, `interval`, `currency`, `billingProviderRef` (Stripe-like External ref, stored encrypted at rest if API keys). Deliberately **no** raw PCI data.

## 9.2 API endpoints

```text
GET  /plans
GET  /subscription (my tenant), POST /subscription/change, POST /subscription/cancel
POST /billing/checkout-session      (Idempotency-Key)
POST /billing/webhook               (provider signature-verified; events → billing_events)
GET  /usage/limits                  GET /usage/current
POST /admin/tenants/:id/override-limit
```

## 9.3 Permissions (new)

```text
platform.billing.admin
platform.subscription.view
platform.usage.view
```

## 9.4 Enforcement

- Guard middleware checks plan limits (users, storage) on the relevant endpoints; exceed → `LIMIT_EXCEEDED` (402/403).
- Usage metrics fed by an end-of-request or worker tap (batch, idempotent).

## 9.5 Flutter `features/settings/` + `features/billing/`

- Billing portal, plan comparison, usage meters, invoice history.

### Definition of Done

Self-serve registration → trial → plan upgrade with enforced limits and usage visibility.

---

# V1 COMPLETENESS — PRODUCTION READINESS (plan §29)

Track these checkboxes as phases land; V1 = Phases 0–5 + Dashboard:

```text
[ ] Tenant isolation tested                         (auto cross-tenant e2e, every module)
[ ] RLS policies enabled + forced on all tenant tables
[ ] Authentication / session rotation tested
[ ] RBAC tested
[ ] Migrations reproducible
[ ] Audit logging operational
[ ] API documented (Swagger already at /api/v1/docs — keep current)
[ ] Standard error handling
[ ] Financial transactions protected (immutable, reversal-only)
[ ] Idempotency tested on payment/bank endpoints
[ ] Document sequence concurrency tested (no duplicates)
[ ] Inventory movements auditable
[ ] PDF generation reliable (worker + document_files)
[ ] Document file versioning verified
[ ] Email notifications reliable
[ ] Dead-letter queue surfaced to ops
[ ] Web + desktop + mobile builds pass
[ ] CI passing (backend + Flutter jobs exist)
[ ] Staging environment working
[ ] Monitoring + security review + load test
[ ] Seeds reproducible (COA, tax, UoM, demo tenant)
```

---

# Suggested build order (gates)

Use G-1..G-8 (platform) to unblock; then phase-by-phase so each ships with tests + Flutter screens:

```text
M0   G-1 sequence service, G-2 document_files, G-6 worker wiring, G-7 e2e scaffold
M1   Phase 3 warehouses + stock_balances + stock_movements (minimal) → Sales
M2   Phase 4 full Inventory
M3   Phase 5 Finance (+ COA seed G-4)
M4   Phase 6 Procurement
M5   Phase 7a HR Master
M6   Phase 7b Payroll ✓ COMPLETE (+ S3 G-3)
M7   Phase 8 Operations + Dashboards ✓ COMPLETE
M8   Phase 9 SaaS ✓ COMPLETE
M9   V1 readiness audit (checklist above) + staging deploy
```

Each M-​gate must pass: `npm run lint`, typecheck, unit + integration + e2e tests, and (for Flutter touches) `flutter analyze`.
