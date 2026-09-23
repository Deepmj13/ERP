-- Scope document numbers to the tenant.
--
-- The document_sequences table allocates numbers per (tenant, document_type,
-- financial_year) — every tenant starts at QTO-0001 / SO-0001 / DEL-0001 /
-- INV-0001 / PAY-0001. But the numbered document columns were declared with a
-- GLOBAL unique index, so the first document a second tenant posts collided
-- with the first tenant's QTO-0001 etc. (Prisma error P2002 wrapped as HTTP
-- 500 on quotation approve). Numbers are meaningful only within a tenant, so
-- drop the global index and enforce uniqueness per tenant.

DROP INDEX IF EXISTS "quotations_number_key";
DROP INDEX IF EXISTS "sales_orders_number_key";
DROP INDEX IF EXISTS "deliveries_number_key";
DROP INDEX IF EXISTS "invoices_number_key";
DROP INDEX IF EXISTS "payments_number_key";

CREATE UNIQUE INDEX "quotations_tenant_id_number_key" ON "quotations" ("tenant_id", "number");
CREATE UNIQUE INDEX "sales_orders_tenant_id_number_key" ON "sales_orders" ("tenant_id", "number");
CREATE UNIQUE INDEX "deliveries_tenant_id_number_key" ON "deliveries" ("tenant_id", "number");
CREATE UNIQUE INDEX "invoices_tenant_id_number_key" ON "invoices" ("tenant_id", "number");
CREATE UNIQUE INDEX "payments_tenant_id_number_key" ON "payments" ("tenant_id", "number");