-- Phase 9 — SaaS platform (plan §27 Phase 9 / future.md).
-- subscription_plans is a platform-level reference table (identity — RLS-exempt,
-- like permissions). usage_metrics / billing_events are tenant-owned:
-- RLS ENABLE + FORCE with the standard tenant policy (ADR-0002).

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "interval" VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
    "price" DECIMAL(18,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "features" JSONB NOT NULL DEFAULT '{}',
    "limits" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateTable
CREATE TABLE "usage_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "metric" VARCHAR(50) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_metrics_tenant_id_metric_recorded_at_idx" ON "usage_metrics"("tenant_id", "metric", "recorded_at");

-- AddForeignKey
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
ALTER TABLE "usage_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_metrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_usage_metrics" ON "usage_metrics"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_events_tenant_id_created_at_idx" ON "billing_events"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_billing_events" ON "billing_events"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- AlterTable (Phase 9 extends the stub Subscription model)
-- Single active subscription per tenant; plan_code carries the SubscriptionPlan ref.
DROP INDEX "subscriptions_tenant_id_plan_key";
ALTER TABLE "subscriptions" RENAME COLUMN "plan" TO "plan_code";
ALTER TABLE "subscriptions" ALTER COLUMN "plan_code" TYPE VARCHAR(40);
ALTER TABLE "subscriptions" ADD COLUMN "interval" VARCHAR(16) NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "subscriptions" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE "subscriptions" ADD COLUMN "billing_provider_ref" VARCHAR(128);
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" TIMESTAMPTZ(6);
ALTER TABLE "subscriptions" ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscriptions" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_plan_code_key" ON "subscriptions"("tenant_id", "plan_code");