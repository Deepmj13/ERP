/**
 * Seed — production-required standard reference data (plan §3).
 * Idempotent: safe to run repeatedly.
 *
 * Phase 0 scope: base permission codes. Chart of accounts, tax and UoM
 * seeds arrive with their modules (Finance, Product master).
 */
import { PrismaClient } from '../src';

const prisma = new PrismaClient();

const BASE_PERMISSIONS: Array<{ code: string; group: string; description: string }> = [
  // Platform
  { code: 'platform.tenant.view', group: 'platform', description: 'View tenant information' },
  { code: 'platform.settings.edit', group: 'platform', description: 'Edit platform settings' },
  { code: 'platform.audit.view', group: 'platform', description: 'View audit logs' },

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

  // Inventory
  { code: 'inventory.stock.view', group: 'inventory', description: 'View stock' },
  { code: 'inventory.stock.adjust', group: 'inventory', description: 'Adjust stock' },
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
  { code: 'hr.payroll.view', group: 'hr', description: 'View payroll' },
  { code: 'hr.payroll.approve', group: 'hr', description: 'Approve payroll' },

  // CRM
  { code: 'crm.customer.view', group: 'crm', description: 'View customers' },
  { code: 'crm.customer.edit', group: 'crm', description: 'Edit customers' },
  { code: 'crm.lead.view', group: 'crm', description: 'View leads' },
  { code: 'crm.lead.edit', group: 'crm', description: 'Edit leads' },
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
