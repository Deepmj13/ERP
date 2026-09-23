/**
 * Idempotent demo tenant fixture (G-4 / plan §3). Creates a "Demo Tenant"
 * (slug `demo`) with company + branches, seeded COA/tax/units/default roles,
 * customers + contacts, products, and demo users that can log in via the API.
 *
 * Skip-if-present: if a tenant with the demo slug already exists, nothing is
 * created, so the fixture is safe to run repeatedly. All tenant-owned rows are
 * written inside one tenant-armed transaction (RLS FORCED).
 *
 * Sample *documents* are deliberately not created here — business documents
 * (quotes, orders, invoices, payments, journals) must go through the service
 * layer so numbering, stock and ledger invariants hold (see e2e flows).
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/client';
import { seedChartOfAccounts } from '../system/chart-of-accounts';
import { seedDefaultRoles } from '../system/default-roles';
import { seedTaxRates } from '../system/tax-rates';
import { seedUnits } from '../system/units';

export const DEMO_TENANT_SLUG = 'demo';
export const DEMO_PASSWORD = 'Demo1234!';

interface DemoUserSpec {
  email: string;
  fullName: string;
  role: string;
}

const DEMO_USERS: DemoUserSpec[] = [
  { email: 'owner@demo.erp', fullName: 'Demo Owner', role: 'Owner' },
  { email: 'admin@demo.erp', fullName: 'Demo Admin', role: 'Admin' },
  { email: 'sales@demo.erp', fullName: 'Demo Sales Rep', role: 'Sales' },
  { email: 'finance@demo.erp', fullName: 'Demo Finance Ops', role: 'Finance' },
  { email: 'warehouse@demo.erp', fullName: 'Demo Warehouse Keeper', role: 'Inventory' },
];

const PRODUCT_CATEGORIES = [
  { code: 'ELEC', name: 'Electronics' },
  { code: 'OFFICE', name: 'Office Supplies' },
  { code: 'SERV', name: 'Services' },
];

interface DemoProductRow {
  sku: string;
  name: string;
  categoryCode: string;
  unitCode: string;
  taxCode: string;
  costPrice: number;
  salePrice: number;
  type: 'GOOD' | 'SERVICE';
}

const DEMO_PRODUCTS: DemoProductRow[] = [
  { sku: 'LAPTOP-P14', name: 'Laptop Pro 14', categoryCode: 'ELEC', unitCode: 'PCS', taxCode: 'VAT-SR', costPrice: 720, salePrice: 949, type: 'GOOD' },
  { sku: 'MON-27-4K', name: '27in 4K Monitor', categoryCode: 'ELEC', unitCode: 'PCS', taxCode: 'VAT-SR', costPrice: 210, salePrice: 329, type: 'GOOD' },
  { sku: 'KB-MECH', name: 'Mechanical Keyboard', categoryCode: 'ELEC', unitCode: 'PCS', taxCode: 'VAT-SR', costPrice: 55, salePrice: 79, type: 'GOOD' },
  { sku: 'PAPER-A4', name: 'A4 Paper Ream', categoryCode: 'OFFICE', unitCode: 'BOX', taxCode: 'VAT-RD', costPrice: 3.2, salePrice: 5.4, type: 'GOOD' },
  { sku: 'PEN-GEL', name: 'Gel Pen Black', categoryCode: 'OFFICE', unitCode: 'PCS', taxCode: 'VAT-RD', costPrice: 0.4, salePrice: 0.8, type: 'GOOD' },
  { sku: 'CONS-TECH', name: 'IT Consulting', categoryCode: 'SERV', unitCode: 'HRS', taxCode: 'VAT-SR', costPrice: 40, salePrice: 95, type: 'SERVICE' },
];

interface DemoCustomerRow {
  code: string;
  name: string;
  email: string;
  phone: string;
}

const DEMO_CUSTOMERS: DemoCustomerRow[] = [
  { code: 'C-1001', name: 'Acme Distribution', email: 'billing@acme.example', phone: '+15551230001' },
  { code: 'C-1002', name: 'Globex Retail', email: 'ap@globex.example', phone: '+15551230002' },
  { code: 'C-1003', name: 'Initech Services', email: 'finance@initech.example', phone: '+15551230003' },
  { code: 'C-1004', name: 'Umbrella Corp', email: 'payables@umbrella.example', phone: '+15551230004' },
];

export async function seedDemoFixture(client: PrismaClient): Promise<void> {
  const existing = await client.tenant.findUnique({ where: { slug: DEMO_TENANT_SLUG } });
  if (existing) {
    console.log('Demo tenant already present; skipping fixture');
    return;
  }

  await client.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: 'Demo Tenant', slug: DEMO_TENANT_SLUG, status: 'ACTIVE' },
      });
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)`;

      await tx.subscription.create({
        data: { tenantId: tenant.id, planCode: 'starter', status: 'ACTIVE', startedAt: new Date() },
      });
      await tx.billingEvent.create({
        data: {
          tenantId: tenant.id,
          eventType: 'subscription_changed',
          payload: { planCode: 'starter' },
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: tenant.id,
          name: 'Demo Company Ltd',
          legalName: 'Demo Company Ltd',
          taxId: 'DEMO-123456',
          email: 'hello@demo.erp',
        },
      });
      await tx.branch.create({
        data: { tenantId: tenant.id, companyId: company.id, name: 'Main Office', code: 'HQ' },
      });

      await seedChartOfAccounts(tx, tenant.id);
      await seedTaxRates(tx, tenant.id);
      await seedUnits(tx, tenant.id);
      await seedDefaultRoles(tx, tenant.id);

      const categoryIds = new Map<string, string>();
      for (const cat of PRODUCT_CATEGORIES) {
        const row = await tx.productCategory.create({
          data: { tenantId: tenant.id, name: cat.name, code: cat.code },
        });
        categoryIds.set(cat.code, row.id);
      }

      const unitByCode = await tx.unit.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, code: true },
      });
      const taxByCode = await tx.taxRate.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, code: true },
      });
      const unitId = new Map(unitByCode.map((u) => [u.code, u.id]));
      const taxId = new Map(taxByCode.map((t) => [t.code, t.id]));

      for (const p of DEMO_PRODUCTS) {
        const unit = unitId.get(p.unitCode);
        const tax = taxId.get(p.taxCode);
        if (!unit || !tax) throw new Error(`Demo fixture: missing unit/tax code for ${p.sku}`);
        await tx.product.create({
          data: {
            tenantId: tenant.id,
            categoryId: categoryIds.get(p.categoryCode),
            unitId: unit,
            taxRateId: tax,
            type: p.type,
            name: p.name,
            sku: p.sku,
            costPrice: p.costPrice,
            salePrice: p.salePrice,
          },
        });
      }

      for (const c of DEMO_CUSTOMERS) {
        const customer = await tx.customer.create({
          data: {
            tenantId: tenant.id,
            code: c.code,
            name: c.name,
            email: c.email,
            phone: c.phone,
          },
        });
        await tx.customerContact.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            isPrimary: true,
          },
        });
      }

      const roles = await tx.role.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true },
      });
      const roleBy = new Map(roles.map((r) => [r.name, r.id]));
      const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

      for (const spec of DEMO_USERS) {
        const userId = (
          await tx.user.create({
            data: { email: spec.email, passwordHash, fullName: spec.fullName },
            select: { id: true },
          })
        ).id;
        await tx.tenantUser.create({
          data: { tenantId: tenant.id, userId, status: 'ACTIVE' },
        });
        const roleId = roleBy.get(spec.role);
        if (!roleId) throw new Error(`Demo fixture: role ${spec.role} missing`);
        await tx.userRole.create({
          data: { userId, roleId, tenantId: tenant.id },
        });
      }
    },
    { maxWait: 30_000, timeout: 600_000 },
  );

  console.log('Seeded demo tenant (slug=demo), 5 users, 6 products, 4 customers');
}