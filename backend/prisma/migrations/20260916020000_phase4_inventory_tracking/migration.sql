-- ---------------------------------------------------------------------------
-- Phase 4 — inventory tracking: batches + serial_numbers (plan §10/§14).
-- Warehouse/stock_balances/stock_movements shipped with Phase 3 (M1).
-- ---------------------------------------------------------------------------

CREATE TABLE "batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_no" VARCHAR(64) NOT NULL,
    "expiry_date" TIMESTAMPTZ(6),
    "manufactured_date" TIMESTAMPTZ(6),
    "quantity_remaining" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "batches_tenant_id_product_id_batch_no_key" ON "batches"("tenant_id", "product_id", "batch_no");

CREATE TABLE "serial_numbers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID,
    "serial_no" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'IN_STOCK',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "serial_numbers_tenant_id_product_id_serial_no_key" ON "serial_numbers"("tenant_id", "product_id", "serial_no");

-- unit_cost on the stock ledger (plan §14) — costing lands with Finance/Procurement.
ALTER TABLE "stock_movements" ADD COLUMN "unit_cost" DECIMAL(18,4);

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: ENABLE + FORCE + tenant policy (ADR-0002 / rule 2)
-- ---------------------------------------------------------------------------

ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_batches" ON "batches"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "serial_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "serial_numbers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_serial_numbers" ON "serial_numbers"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);