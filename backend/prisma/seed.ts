/**
 * Seed — production-required standard reference data (plan §3).
 * Idempotent: safe to run repeatedly.
 *
 * Permission codes + standard chart of accounts (+ tax rates, units, default
 * roles) + the idempotent demo tenant fixture (G-4).
 * COA/tax/unit/role rows are tenant-owned and RLS-FORCED, so each tenant's
 * upserts run inside a tenant-armed transaction.
 */
import { PrismaClient } from '../src/database';
import { seedChartOfAccounts } from '../src/database/system/chart-of-accounts';
import { seedDefaultRoles } from '../src/database/system/default-roles';
import { seedTaxRates } from '../src/database/system/tax-rates';
import { seedUnits } from '../src/database/system/units';
import { seedDemoFixture } from '../src/database/fixtures/demo';

const prisma = new PrismaClient();

const BASE_PERMISSIONS: Array<{ code: string; group: string; description: string }> = [
  // Platform
  { code: 'platform.tenant.view', group: 'platform', description: 'View tenant information' },
  { code: 'platform.settings.edit', group: 'platform', description: 'Edit platform settings' },
  { code: 'platform.audit.view', group: 'platform', description: 'View audit logs' },
  { code: 'platform.billing.admin', group: 'platform', description: 'Manage platform billing and limits' },
  { code: 'platform.subscription.view', group: 'platform', description: 'View subscription and plans' },
  { code: 'platform.usage.view', group: 'platform', description: 'View usage metrics and limits' },

  // Organization / users / roles
  { code: 'org.user.view', group: 'organization', description: 'View users' },
  { code: 'org.user.invite', group: 'organization', description: 'Invite users' },
  { code: 'org.user.edit', group: 'organization', description: 'Edit users' },
  { code: 'org.role.view', group: 'organization', description: 'View roles' },
  { code: 'org.role.edit', group: 'organization', description: 'Create and edit roles' },

  // Sales
  { code: 'sales.quote.view', group: 'sales', description: 'View quotations' },
  { code: 'sales.quote.create', group: 'sales', description: 'Create quotations' },
  { code: 'sales.quote.edit', group: 'sales', description: 'Edit quotations' },
  { code: 'sales.quote.approve', group: 'sales', description: 'Approve quotations' },
  { code: 'sales.quote.cancel', group: 'sales', description: 'Cancel quotations' },
  { code: 'sales.order.view', group: 'sales', description: 'View sales orders' },
  { code: 'sales.order.create', group: 'sales', description: 'Create sales orders' },
  { code: 'sales.order.approve', group: 'sales', description: 'Approve sales orders' },
  { code: 'sales.order.edit', group: 'sales', description: 'Edit sales orders' },
  { code: 'sales.order.cancel', group: 'sales', description: 'Cancel sales orders' },
  { code: 'sales.delivery.view', group: 'sales', description: 'View deliveries' },
  { code: 'sales.delivery.create', group: 'sales', description: 'Create deliveries' },
  { code: 'sales.delivery.post', group: 'sales', description: 'Post deliveries (stock out)' },
  { code: 'sales.invoice.view', group: 'sales', description: 'View invoices' },
  { code: 'sales.invoice.create', group: 'sales', description: 'Create invoices' },
  { code: 'sales.invoice.approve', group: 'sales', description: 'Approve invoices' },
  { code: 'sales.invoice.post', group: 'sales', description: 'Post invoices' },
  { code: 'sales.invoice.edit', group: 'sales', description: 'Edit invoices' },
  { code: 'sales.invoice.cancel', group: 'sales', description: 'Cancel invoices' },
  { code: 'sales.payment.view', group: 'sales', description: 'View payments' },
  { code: 'sales.payment.create', group: 'sales', description: 'Create payments' },
  { code: 'sales.payment.capture', group: 'sales', description: 'Capture payments' },
  { code: 'sales.payment.void', group: 'sales', description: 'Void payments' },

  // Finance
  { code: 'finance.bank-account.view', group: 'finance', description: 'View bank accounts' },
  { code: 'finance.bank-account.edit', group: 'finance', description: 'Create/edit bank accounts' },
  { code: 'finance.account.view', group: 'finance', description: 'View chart of accounts' },
  { code: 'finance.account.edit', group: 'finance', description: 'Create/edit accounts (non-system)' },
  { code: 'finance.journal.reverse', group: 'finance', description: 'Reverse posted journal entries' },
  { code: 'finance.report.view', group: 'finance', description: 'View financial reports' },
  { code: 'finance.period.view', group: 'finance', description: 'View fiscal periods' },
  { code: 'finance.period.edit', group: 'finance', description: 'Create/edit fiscal periods' },
  { code: 'finance.period.close', group: 'finance', description: 'Close fiscal periods' },
  { code: 'finance.bank.view', group: 'finance', description: 'View bank transactions' },
  { code: 'finance.bank.edit', group: 'finance', description: 'Create/edit bank transactions' },
  { code: 'finance.bank.reconcile', group: 'finance', description: 'Reconcile/match bank transactions' },

  // Procurement
  { code: 'procurement.vendor.view', group: 'procurement', description: 'View vendors' },
  { code: 'procurement.vendor.edit', group: 'procurement', description: 'Create/edit vendors' },
  { code: 'procurement.request.view', group: 'procurement', description: 'View purchase requests' },
  { code: 'procurement.request.create', group: 'procurement', description: 'Create purchase requests' },
  { code: 'procurement.request.edit', group: 'procurement', description: 'Edit purchase requests' },
  { code: 'procurement.request.approve', group: 'procurement', description: 'Approve purchase requests' },
  { code: 'procurement.order.view', group: 'procurement', description: 'View purchase orders' },
  { code: 'procurement.order.create', group: 'procurement', description: 'Create purchase orders' },
  { code: 'procurement.order.edit', group: 'procurement', description: 'Edit purchase orders' },
  { code: 'procurement.order.approve', group: 'procurement', description: 'Approve purchase orders' },
  { code: 'procurement.grn.view', group: 'procurement', description: 'View goods receipts' },
  { code: 'procurement.grn.create', group: 'procurement', description: 'Create goods receipts' },
  { code: 'procurement.grn.post', group: 'procurement', description: 'Post goods receipts (stock in)' },
  { code: 'procurement.bill.view', group: 'procurement', description: 'View vendor bills' },
  { code: 'procurement.bill.create', group: 'procurement', description: 'Create vendor bills' },
  { code: 'procurement.bill.approve', group: 'procurement', description: 'Approve vendor bills' },
  { code: 'procurement.bill.post', group: 'procurement', description: 'Post vendor bills (AP entry)' },
  { code: 'procurement.payment.view', group: 'procurement', description: 'View vendor payments' },
  { code: 'procurement.payment.create', group: 'procurement', description: 'Create vendor payments' },
  { code: 'procurement.payment.capture', group: 'procurement', description: 'Capture vendor payments' },

  // Inventory
  { code: 'inventory.stock.view', group: 'inventory', description: 'View stock' },
  { code: 'inventory.stock.adjust', group: 'inventory', description: 'Adjust stock' },
  {
    code: 'inventory.stock.transfer',
    group: 'inventory',
    description: 'Transfer stock between warehouses',
  },
  {
    code: 'inventory.stock.movement.view',
    group: 'inventory',
    description: 'View stock movements ledger',
  },
  { code: 'inventory.warehouse.view', group: 'inventory', description: 'View warehouses' },
  { code: 'inventory.warehouse.edit', group: 'inventory', description: 'Create/edit warehouses' },
  { code: 'inventory.batch.view', group: 'inventory', description: 'View batches' },
  { code: 'inventory.batch.edit', group: 'inventory', description: 'Create/edit batches' },
  { code: 'inventory.serial.view', group: 'inventory', description: 'View serial numbers' },
  { code: 'inventory.serial.edit', group: 'inventory', description: 'Create/edit serial numbers' },
  { code: 'inventory.product.view', group: 'inventory', description: 'View products' },
  { code: 'inventory.product.edit', group: 'inventory', description: 'Create and edit products' },
  { code: 'inventory.category.view', group: 'inventory', description: 'View product categories' },
  { code: 'inventory.category.edit', group: 'inventory', description: 'Edit product categories' },
  { code: 'inventory.unit.view', group: 'inventory', description: 'View units of measure' },
  { code: 'inventory.unit.edit', group: 'inventory', description: 'Edit units of measure' },

  // Finance
  { code: 'finance.invoice.view', group: 'finance', description: 'View finance invoices' },
  { code: 'finance.invoice.create', group: 'finance', description: 'Create finance invoices' },
  { code: 'finance.invoice.approve', group: 'finance', description: 'Approve finance invoices' },
  { code: 'finance.invoice.post', group: 'finance', description: 'Post finance invoices' },
  { code: 'finance.journal.view', group: 'finance', description: 'View journal entries' },
  { code: 'finance.journal.post', group: 'finance', description: 'Post journal entries' },
  { code: 'finance.tax.view', group: 'finance', description: 'View tax rates' },
  { code: 'finance.tax.edit', group: 'finance', description: 'Edit tax rates' },

  // HR
  { code: 'hr.employee.view', group: 'hr', description: 'View employees' },
  { code: 'hr.employee.edit', group: 'hr', description: 'Edit employees' },
  { code: 'hr.department.view', group: 'hr', description: 'View departments' },
  { code: 'hr.department.edit', group: 'hr', description: 'Create/edit departments' },
  { code: 'hr.attendance.view', group: 'hr', description: 'View attendance' },
  { code: 'hr.attendance.edit', group: 'hr', description: 'Edit attendance' },
  { code: 'hr.leave.view', group: 'hr', description: 'View leave requests' },
  { code: 'hr.leave.edit', group: 'hr', description: 'Edit leave requests' },
  { code: 'hr.leave.approve', group: 'hr', description: 'Approve/reject leave requests' },
  { code: 'hr.leave.self', group: 'hr', description: 'Request own leaves and punch own attendance' },
  { code: 'hr.payroll.view', group: 'hr', description: 'View payroll' },
  { code: 'hr.payroll.approve', group: 'hr', description: 'Approve payroll' },
  { code: 'hr.salary.view', group: 'hr', description: 'View salary structures' },
  { code: 'hr.salary.edit', group: 'hr', description: 'Create/edit salary structures' },
  { code: 'hr.payroll.run', group: 'hr', description: 'Create and calculate payroll runs' },
  { code: 'hr.payroll.post', group: 'hr', description: 'Post payroll runs (salary journal entry)' },
  { code: 'hr.payroll.reverse', group: 'hr', description: 'Reverse posted payroll runs' },
  { code: 'hr.payslip.view', group: 'hr', description: 'View payslips' },
  { code: 'hr.payslip.generate', group: 'hr', description: 'Generate payslip PDFs' },

  // CRM
  { code: 'crm.customer.view', group: 'crm', description: 'View customers' },
  { code: 'crm.customer.edit', group: 'crm', description: 'Edit customers' },
  { code: 'crm.lead.view', group: 'crm', description: 'View leads' },
  { code: 'crm.lead.edit', group: 'crm', description: 'Edit leads' },

  // Operations (Phase 8)
  { code: 'ops.project.view', group: 'ops', description: 'View projects' },
  { code: 'ops.project.edit', group: 'ops', description: 'Create/edit projects' },
  { code: 'ops.task.view', group: 'ops', description: 'View tasks' },
  { code: 'ops.task.edit', group: 'ops', description: 'Create/edit tasks' },
  { code: 'ops.task.status', group: 'ops', description: 'Change task status' },
  { code: 'ops.approval.view', group: 'ops', description: 'View approval inbox/requests' },
  { code: 'ops.approval.act', group: 'ops', description: 'Approve/reject approval requests' },
  { code: 'ops.notification.view', group: 'ops', description: 'View notifications' },
  { code: 'ops.dashboard.view', group: 'ops', description: 'View dashboard KPIs' },
];

interface PlanSeed {
  code: string;
  name: string;
  interval: string;
  price: number;
  currency: string;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
  isActive: boolean;
}

const SUBSCRIPTION_PLANS: PlanSeed[] = [
  {
    code: 'trial',
    name: 'Trial',
    interval: 'MONTHLY',
    price: 0,
    currency: 'USD',
    features: { all: true },
    limits: { users: 3, storage_mb: 128, documents: 100 },
    isActive: true,
  },
  {
    code: 'free',
    name: 'Free',
    interval: 'MONTHLY',
    price: 0,
    currency: 'USD',
    features: { all: false },
    limits: { users: 1, storage_mb: 64, documents: 50 },
    isActive: true,
  },
  {
    code: 'starter',
    name: 'Starter',
    interval: 'MONTHLY',
    price: 29,
    currency: 'USD',
    features: { all: true },
    limits: { users: 10, storage_mb: 512, documents: 5000 },
    isActive: true,
  },
  {
    code: 'professional',
    name: 'Professional',
    interval: 'MONTHLY',
    price: 99,
    currency: 'USD',
    features: { all: true },
    limits: { users: 50, storage_mb: 5120, documents: 50000 },
    isActive: true,
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    interval: 'YEARLY',
    price: 999,
    currency: 'USD',
    features: { all: true },
    limits: { users: -1, storage_mb: -1, documents: -1 },
    isActive: true,
  },
];

async function main(): Promise<void> {
  for (const p of BASE_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description, group: p.group },
      create: p,
    });
  }
  const count = await prisma.permission.count();
  console.log(`Seeded ${count} permission codes`);

  // Phase 9: default subscription plans. Platform-level reference data
  // (RLS-exempt) — the same category as permissions.
  for (const plan of SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        interval: plan.interval,
        price: plan.price,
        currency: plan.currency,
        features: plan.features,
        limits: plan.limits,
        isActive: plan.isActive,
      },
      create: plan,
    });
  }
  const planCount = await prisma.subscriptionPlan.count();
  console.log(`Seeded ${planCount} subscription plans`);

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await prisma.$transaction(
      async (tx) => {
        await seedChartOfAccounts(tx as never, tenant.id);
        await seedTaxRates(tx as never, tenant.id);
        await seedUnits(tx as never, tenant.id);
        await seedDefaultRoles(tx as never, tenant.id);
      },
      { maxWait: 30_000, timeout: 600_000 },
    );
  }
  console.log(`Seeded system data for ${tenants.length} tenant(s)`);

  await seedDemoFixture(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
