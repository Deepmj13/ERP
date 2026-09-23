-- RLS backstop (ADR-0002) — tenant isolation at the database layer.
--
-- Strategy:
--  * Strict RLS + FORCE on every *business* table carrying tenant_id: outside
--    an authenticated tenant context (GUC `app.current_tenant_id` unset) reads
--    and writes return/affect zero rows.
--  * Identity/bootstrap tables are exempt (documented in ADR-0002 addendum):
--      users, tenants, tenant_users, permissions, _prisma_migrations.
--  * A BEFORE INSERT trigger on `tenants` arms the GUC so self-registration
--    (which must create its own tenant) can write its scaffold rows inside the
--    same transaction.
--
-- GUC guard: current_setting('app.current_tenant_id', true) is '' when unset;
-- NULLIF(...) makes the cast NULL so `tenant_id = NULL` -> no rows -> denied.

-- ---------------------------------------------------------------------------
-- Bootstrap: arm the tenant context when a tenant row is created.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_tenant_rls_context() RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', NEW.id::text, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_bootstrap_context
  BEFORE INSERT ON "tenants"
  FOR EACH ROW
  EXECUTE FUNCTION set_tenant_rls_context();

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_roles" ON "roles"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------

ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_role_permissions" ON "role_permissions"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_user_roles" ON "user_roles"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_sessions" ON "sessions"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- idempotency_keys
-- ---------------------------------------------------------------------------

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_idempotency_keys" ON "idempotency_keys"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- document_sequences
-- ---------------------------------------------------------------------------

ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_document_sequences" ON "document_sequences"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_audit_logs" ON "audit_logs"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_companies" ON "companies"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_branches" ON "branches"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- tenant_settings
-- ---------------------------------------------------------------------------

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_tenant_settings" ON "tenant_settings"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_subscriptions" ON "subscriptions"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);