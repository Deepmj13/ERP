/**
 * Default tenant roles (G-4 / plan §3). The "Owner" role is created at
 * registration (auth.service.ts) carrying every permission. These four
 * operational roles are seeded per tenant for day-to-day assignment, each
 * carrying the permission subset matching its domain.
 *
 * Roles are tenant-owned and RLS-FORCED — the upserts run inside a tenant-armed
 * transaction (same pattern as chart-of-accounts.ts).
 */
import { Prisma } from '../generated/client';

export interface SeedRoleRow {
  name: string;
  description: string;
  /** Explicit permission-code subset. Mutually exclusive with `all`. */
  permissions?: string[];
  /** Grant every non-platform permission (Admin). */
  all?: boolean;
}

export const DEFAULT_ROLES: SeedRoleRow[] = [
  {
    name: 'Admin',
    description: 'Full operational access across all business modules',
    all: true,
  },
  {
    name: 'Sales',
    description: 'Quote → order → delivery → invoice → payment workflow',
    permissions: [
      'sales.quote.view',
      'sales.quote.create',
      'sales.quote.edit',
      'sales.quote.approve',
      'sales.quote.cancel',
      'sales.order.view',
      'sales.order.create',
      'sales.order.edit',
      'sales.order.approve',
      'sales.order.cancel',
      'sales.delivery.view',
      'sales.delivery.create',
      'sales.delivery.post',
      'sales.invoice.view',
      'sales.invoice.create',
      'sales.invoice.approve',
      'sales.invoice.edit',
      'sales.invoice.post',
      'sales.invoice.cancel',
      'sales.payment.view',
      'sales.payment.create',
      'sales.payment.capture',
      'sales.payment.void',
      'crm.customer.view',
      'crm.customer.edit',
      'crm.lead.view',
      'inventory.product.view',
      'inventory.stock.view',
      'inventory.warehouse.view',
      'finance.bank-account.view',
      'finance.tax.view',
    ],
  },
  {
    name: 'Inventory',
    description: 'Warehouse and stock operations',
    permissions: [
      'inventory.warehouse.view',
      'inventory.warehouse.edit',
      'inventory.stock.view',
      'inventory.stock.adjust',
      'inventory.stock.transfer',
      'inventory.stock.movement.view',
      'inventory.batch.view',
      'inventory.batch.edit',
      'inventory.serial.view',
      'inventory.serial.edit',
      'inventory.product.view',
      'inventory.product.edit',
      'inventory.category.view',
      'inventory.category.edit',
      'inventory.unit.view',
      'inventory.unit.edit',
      'finance.tax.view',
      'sales.delivery.view',
    ],
  },
  {
    name: 'Finance',
    description: 'Accounting, COA, journals, reports and payments',
    permissions: [
      'finance.account.view',
      'finance.account.edit',
      'finance.journal.view',
      'finance.journal.post',
      'finance.journal.reverse',
      'finance.report.view',
      'finance.period.view',
      'finance.period.edit',
      'finance.period.close',
      'finance.bank.view',
      'finance.bank.edit',
      'finance.bank.reconcile',
      'finance.bank-account.view',
      'finance.bank-account.edit',
      'finance.tax.view',
      'finance.tax.edit',
      'finance.invoice.view',
      'finance.invoice.create',
      'finance.invoice.approve',
      'finance.invoice.post',
      'sales.invoice.view',
      'sales.invoice.create',
      'sales.invoice.approve',
      'sales.invoice.edit',
      'sales.invoice.post',
      'sales.invoice.cancel',
      'sales.payment.view',
      'sales.payment.create',
      'sales.payment.capture',
      'sales.payment.void',
      'crm.customer.view',
    ],
  },
];

/**
 * Idempotently seeds the default operational roles for one tenant, granting
 * each role its permission subset. Unknown codes are skipped (the catalog is
 * additive across versions); a role whose subset resolves to nothing errors.
 */
export async function seedDefaultRoles(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

  const all = await tx.permission.findMany({ select: { id: true, code: true, group: true } });
  const byCode = new Map(all.map((p) => [p.code, p.id]));

  for (const def of DEFAULT_ROLES) {
    const ids = def.all
      ? all.filter((p) => p.group !== 'platform').map((p) => p.id)
      : (def.permissions ?? [])
          .map((code) => byCode.get(code))
          .filter((id): id is string => id !== undefined);

    if (ids.length === 0) {
      throw new Error(`Default role seed: ${def.name} resolved no permissions`);
    }

    const role = await tx.role.upsert({
      where: { tenantId_name: { tenantId, name: def.name } },
      update: { isSystem: true },
      create: { tenantId, name: def.name, isSystem: true },
    });

    await tx.rolePermission.createMany({
      data: ids.map((permissionId) => ({ roleId: role.id, permissionId, tenantId })),
      skipDuplicates: true,
    });
  }
}