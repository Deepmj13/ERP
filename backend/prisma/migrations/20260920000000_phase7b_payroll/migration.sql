-- ---------------------------------------------------------------------------
-- Phase 7b — Payroll (plan §27 Phase 7b): flat salary structures, payroll
-- runs, per-employee payslips. Deviations from the roadmap spec (normalized to
-- conventions):
--   1. payroll_runs.number is unique per-tenant (@@unique([tenantId, number])),
--      NOT globally — derived PR-YYYY-MM from period_start (UTC), immutable on
--      reversal (documents are immutable; the reversing journal entry carries
--      the reversal semantics, rule 6).
--   2. payslips has a real tenant FK + RLS (owned table), employee FK, an
--      updated_at column, and no pdf_version column — the latest PDF is the
--      latest document_files row (documentType=PAYSLIP, status=GENERATED).
-- RLS ENABLE + FORCE with the tenant policy is added for every new tenant
-- table (ADR-0002, rule 2).
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_date" TIMESTAMPTZ(6) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "basic_salary" DECIMAL(18,4) NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '{}',
    "deductions" JSONB NOT NULL DEFAULT '{}',
    "pay_structure_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "posted_by_id" UUID,
    "posted_at" TIMESTAMPTZ(6),
    "total_gross" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_deductions" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reversed_by_id" UUID,
    "reversed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross_pay" DECIMAL(18,4) NOT NULL,
    "total_deductions" DECIMAL(18,4) NOT NULL,
    "net_pay" DECIMAL(18,4) NOT NULL,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_tenant_id_employee_id_effective_date_key"
    ON "salary_structures"("tenant_id", "employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "salary_structures_tenant_id_employee_id_is_active_idx"
    ON "salary_structures"("tenant_id", "employee_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_number_key" ON "payroll_runs"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_period_start_period_end_key"
    ON "payroll_runs"("tenant_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "payroll_runs_tenant_id_status_idx" ON "payroll_runs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payslips_tenant_id_payroll_run_id_idx" ON "payslips"("tenant_id", "payroll_run_id");

-- CreateIndex
CREATE INDEX "payslips_tenant_id_employee_id_idx" ON "payslips"("tenant_id", "employee_id");

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: ENABLE + FORCE + tenant policy (ADR-0002 / rule 2)
-- ---------------------------------------------------------------------------

ALTER TABLE "salary_structures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "salary_structures" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_salary_structures" ON "salary_structures"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_payroll_runs" ON "payroll_runs"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payslips" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_payslips" ON "payslips"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);