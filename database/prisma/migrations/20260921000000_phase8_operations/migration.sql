-- ---------------------------------------------------------------------------
-- Phase 8 �?" Operations (plan �?27 Phase 8 / future.md): projects, tasks, the
-- generic approvals primitive, and the notification inbox. The approvals and
-- notifications primitives here are reused by every earlier phase's state
-- machine. Deviations from the roadmap spec (normalized to conventions):
--   1. notification_preferences carries a tenant_id so it follows the
--      tenant-context / RLS flow used by every API table (ADR-0002, rule 2);
--      identity stays (user_id, channel) composite.
--   2. project.code is user-provided and unique per tenant (no sequence); it
--      does NOT use the document-numbering service.
-- RLS ENABLE + FORCE with the tenant policy is added for every new tenant
-- table (ADR-0002, rule 2).
-- ---------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "budget" DECIMAL(18,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "assignee_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'TODO',
    "priority" VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    "due_date" TIMESTAMPTZ(6),
    "mobile_uuid" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "object_type" VARCHAR(32) NOT NULL,
    "object_id" UUID NOT NULL,
    "object_number" VARCHAR(32),
    "requested_by_id" UUID NOT NULL,
    "approver_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "channel" VARCHAR(16) NOT NULL DEFAULT 'IN_APP',
    "data" JSONB,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_start" VARCHAR(5),
    "quiet_end" VARCHAR(5),

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","channel")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenant_id_code_key" ON "projects"("tenant_id", "code");

CREATE INDEX "projects_tenant_id_status_idx" ON "projects"("tenant_id", "status");

CREATE INDEX "projects_tenant_id_customer_id_idx" ON "projects"("tenant_id", "customer_id");

CREATE UNIQUE INDEX "project_tasks_mobile_uuid_key" ON "project_tasks"("mobile_uuid");

CREATE INDEX "project_tasks_tenant_id_project_id_idx" ON "project_tasks"("tenant_id", "project_id");

CREATE INDEX "project_tasks_tenant_id_assignee_id_status_idx"
    ON "project_tasks"("tenant_id", "assignee_id", "status");

CREATE INDEX "approval_requests_tenant_id_object_type_object_id_idx"
    ON "approval_requests"("tenant_id", "object_type", "object_id");

CREATE INDEX "approval_requests_tenant_id_approver_id_status_idx"
    ON "approval_requests"("tenant_id", "approver_id", "status");

CREATE INDEX "notifications_tenant_id_user_id_read_at_idx"
    ON "notifications"("tenant_id", "user_id", "read_at");

CREATE INDEX "notification_preferences_tenant_id_idx" ON "notification_preferences"("tenant_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS: ENABLE + FORCE + tenant policy (ADR-0002 / rule 2)
-- ---------------------------------------------------------------------------

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_projects" ON "projects"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "project_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_tasks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_project_tasks" ON "project_tasks"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "approval_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_approval_requests" ON "approval_requests"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_notifications" ON "notifications"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_notification_preferences" ON "notification_preferences"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);