-- Phase 2 — CRM + master data schema + RLS (plan §CRM / §Inventory / §Tax).

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

CREATE TABLE "customers" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"  uuid        NOT NULL REFERENCES "tenants"("id"),
  "code"       varchar(32),
  "name"       varchar(255) NOT NULL,
  "email"      varchar(255),
  "phone"      varchar(32),
  "website"    varchar(255),
  "tax_id"     varchar(64),
  "currency"   varchar(3)  NOT NULL DEFAULT 'USD',
  "address"    jsonb,
  "notes"      text,
  "is_active"  boolean     NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "customers_tenant_id_active_idx" ON "customers"("tenant_id", "is_active");

-- ---------------------------------------------------------------------------
-- customer_contacts
-- ---------------------------------------------------------------------------

CREATE TABLE "customer_contacts" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid        NOT NULL REFERENCES "tenants"("id"),
  "customer_id" uuid        NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "name"        varchar(255) NOT NULL,
  "title"       varchar(100),
  "email"       varchar(255),
  "phone"       varchar(32),
  "is_primary"  boolean     NOT NULL DEFAULT false,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts"("customer_id");
CREATE INDEX "customer_contacts_tenant_id_idx"  ON "customer_contacts"("tenant_id");

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------

CREATE TABLE "units" (
  "id"              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid          NOT NULL REFERENCES "tenants"("id"),
  "name"            varchar(100)  NOT NULL,
  "code"            varchar(16)   NOT NULL,
  "symbol"          varchar(16),
  "base_unit_id"    uuid          REFERENCES "units"("id"),
  "factor_to_base"  decimal(18,6),
  "is_active"       boolean       NOT NULL DEFAULT true,
  "created_at"      timestamptz   NOT NULL DEFAULT now(),
  "updated_at"      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE "units"
  ADD CONSTRAINT "units_tenant_id_code_key" UNIQUE ("tenant_id", "code");

-- ---------------------------------------------------------------------------
-- product_categories
-- ---------------------------------------------------------------------------

CREATE TABLE "product_categories" (
  "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid          NOT NULL REFERENCES "tenants"("id"),
  "parent_id"   uuid          REFERENCES "product_categories"("id"),
  "name"        varchar(255)  NOT NULL,
  "code"        varchar(32),
  "description" text,
  "is_active"   boolean       NOT NULL DEFAULT true,
  "created_at"  timestamptz   NOT NULL DEFAULT now(),
  "updated_at"  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX "product_categories_tenant_id_active_idx" ON "product_categories"("tenant_id", "is_active");

-- ---------------------------------------------------------------------------
-- tax_rates
-- ---------------------------------------------------------------------------

CREATE TABLE "tax_rates" (
  "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid          NOT NULL REFERENCES "tenants"("id"),
  "name"        varchar(100)  NOT NULL,
  "code"        varchar(20)   NOT NULL,
  "rate"        decimal(5,2)  NOT NULL,
  "is_inclusive" boolean      NOT NULL DEFAULT false,
  "is_active"   boolean       NOT NULL DEFAULT true,
  "created_at"  timestamptz   NOT NULL DEFAULT now(),
  "updated_at"  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE "tax_rates"
  ADD CONSTRAINT "tax_rates_tenant_id_code_key" UNIQUE ("tenant_id", "code");

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TYPE "ProductType" AS ENUM ('GOOD', 'SERVICE');

CREATE TABLE "products" (
  "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid          NOT NULL REFERENCES "tenants"("id"),
  "category_id" uuid          REFERENCES "product_categories"("id"),
  "unit_id"     uuid          REFERENCES "units"("id"),
  "tax_rate_id" uuid          REFERENCES "tax_rates"("id"),
  "type"        "ProductType" NOT NULL DEFAULT 'GOOD',
  "name"        varchar(255)  NOT NULL,
  "sku"         varchar(64)   NOT NULL,
  "barcode"     varchar(64),
  "description" text,
  "cost_price"  decimal(18,4),
  "sale_price"  decimal(18,4),
  "is_active"   boolean       NOT NULL DEFAULT true,
  "created_at"  timestamptz   NOT NULL DEFAULT now(),
  "updated_at"  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE "products"
  ADD CONSTRAINT "products_tenant_id_sku_key" UNIQUE ("tenant_id", "sku");

CREATE INDEX "products_tenant_id_name_idx" ON "products"("tenant_id", "name");

-- ---------------------------------------------------------------------------
-- RLS backstop (ADR-0002) — same policy pattern as 20260914010000_rls.
-- ---------------------------------------------------------------------------

-- customers
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_customers" ON "customers"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- customer_contacts
ALTER TABLE "customer_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_customer_contacts" ON "customer_contacts"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- units
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_units" ON "units"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- product_categories
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_product_categories" ON "product_categories"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_products" ON "products"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- tax_rates
ALTER TABLE "tax_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_tax_rates" ON "tax_rates"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);