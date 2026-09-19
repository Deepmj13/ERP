/**
 * Standard chart of accounts (G-4 / plan §3). Versioned alongside Phase 5
 * Finance. Seeded per tenant — accounts are tenant-owned and RLS-FORCED, so
 * the upsert runs inside a tenant-armed transaction.
 *
 * Rows are `isSystem=true`: the finance service protects them from editing so
 * report postings keep stable target accounts (Sales Revenue, A/R, Output Tax,
 * Bank, ...). Codes follow a digits-first skeleton so reports can sort by code.
 */
import { Prisma } from '../generated/client';

export interface SeedAccountGroupRow {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
}

export interface SeedAccountRow {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  groupCode: string;
}

export const COA_GROUPS: SeedAccountGroupRow[] = [
  { code: '1000', name: 'Assets', type: 'ASSET' },
  { code: '1100', name: 'Current Assets', type: 'ASSET', parentCode: '1000' },
  { code: '1200', name: 'Fixed Assets', type: 'ASSET', parentCode: '1000' },
  { code: '2000', name: 'Liabilities', type: 'LIABILITY' },
  { code: '2100', name: 'Current Liabilities', type: 'LIABILITY', parentCode: '2000' },
  { code: '2200', name: 'Long-Term Liabilities', type: 'LIABILITY', parentCode: '2000' },
  { code: '3000', name: 'Equity', type: 'EQUITY' },
  { code: '4000', name: 'Revenue', type: 'REVENUE' },
  { code: '4100', name: 'Sales Revenue', type: 'REVENUE', parentCode: '4000' },
  { code: '5000', name: 'Expenses', type: 'EXPENSE' },
  { code: '5100', name: 'Cost of Goods Sold', type: 'EXPENSE', parentCode: '5000' },
  { code: '5200', name: 'Operating Expenses', type: 'EXPENSE', parentCode: '5000' },
  { code: '5300', name: 'Tax Expenses', type: 'EXPENSE', parentCode: '5000' },
];

export const COA_ACCOUNTS: SeedAccountRow[] = [
  { code: '1101', name: 'Cash and Cash Equivalents', type: 'ASSET', groupCode: '1100' },
  { code: '1102', name: 'Bank Account', type: 'ASSET', groupCode: '1100' },
  { code: '1103', name: 'Accounts Receivable', type: 'ASSET', groupCode: '1100' },
  { code: '1104', name: 'Inventory', type: 'ASSET', groupCode: '1100' },
  { code: '1105', name: 'Input Tax Recoverable', type: 'ASSET', groupCode: '1100' },
  { code: '1106', name: 'Prepaid Expenses', type: 'ASSET', groupCode: '1100' },
  { code: '1201', name: 'Fixed Assets', type: 'ASSET', groupCode: '1200' },
  { code: '1202', name: 'Accumulated Depreciation', type: 'ASSET', groupCode: '1200' },
  { code: '2101', name: 'Accounts Payable', type: 'LIABILITY', groupCode: '2100' },
  { code: '2102', name: 'Output Tax Payable', type: 'LIABILITY', groupCode: '2100' },
  { code: '2103', name: 'Accrued Expenses', type: 'LIABILITY', groupCode: '2100' },
  { code: '2104', name: 'Salaries Payable', type: 'LIABILITY', groupCode: '2100' },
  { code: '2105', name: 'Payroll Deductions Payable', type: 'LIABILITY', groupCode: '2100' },
  { code: '2201', name: 'Long-Term Debt', type: 'LIABILITY', groupCode: '2200' },
  { code: '3001', name: "Owner's Equity", type: 'EQUITY', groupCode: '3000' },
  { code: '3002', name: 'Retained Earnings', type: 'EQUITY', groupCode: '3000' },
  { code: '4101', name: 'Sales Revenue', type: 'REVENUE', groupCode: '4100' },
  { code: '4102', name: 'Service Revenue', type: 'REVENUE', groupCode: '4100' },
  { code: '5101', name: 'Cost of Goods Sold', type: 'EXPENSE', groupCode: '5100' },
  { code: '5201', name: 'Salaries and Wages', type: 'EXPENSE', groupCode: '5200' },
  { code: '5202', name: 'Rent Expense', type: 'EXPENSE', groupCode: '5200' },
  { code: '5203', name: 'Utilities Expense', type: 'EXPENSE', groupCode: '5200' },
  { code: '5204', name: 'Office Supplies Expense', type: 'EXPENSE', groupCode: '5200' },
  { code: '5205', name: 'Shipping and Delivery Expense', type: 'EXPENSE', groupCode: '5200' },
  { code: '5301', name: 'Other Taxes and Fees', type: 'EXPENSE', groupCode: '5300' },
];

/**
 * Idempotently seeds the standard chart of accounts for one tenant. Upserts on
 * the per-tenant `(code)` unique keys; system rows are never deleted.
 */
export async function seedChartOfAccounts(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

  const groupCodes: Record<string, string> = {};
  for (const group of COA_GROUPS) {
    const parent = group.parentCode ? groupCodes[group.parentCode] : null;
    const row = await tx.accountGroup.upsert({
      where: { tenantId_code: { tenantId, code: group.code } },
      update: { name: group.name, type: group.type, parentId: parent },
      create: {
        tenantId,
        name: group.name,
        code: group.code,
        type: group.type,
        parentId: parent,
      },
    });
    groupCodes[group.code] = row.id;
  }

  for (const account of COA_ACCOUNTS) {
    const groupId = groupCodes[account.groupCode];
    if (!groupId) {
      throw new Error(`COA seed: account group ${account.groupCode} not seeded`);
    }
    await tx.account.upsert({
      where: { tenantId_code: { tenantId, code: account.code } },
      update: { name: account.name, type: account.type, accountGroupId: groupId },
      create: {
        tenantId,
        name: account.name,
        code: account.code,
        type: account.type,
        accountGroupId: groupId,
        isSystem: true,
      },
    });
  }
}