/**
 * Standard tax rates (G-4 / plan §3). Versioned alongside the Finance module;
 * seeded per tenant alongside the COA. Rows are upserted on the per-tenant
 * `(code)` unique key inside a tenant-armed transaction.
 */
import { Prisma } from '../generated/client';

export interface SeedTaxRateRow {
  code: string;
  name: string;
  rate: number;
  isInclusive?: boolean;
}

export const DEFAULT_TAX_RATES: SeedTaxRateRow[] = [
  { code: 'NONE', name: 'No Tax', rate: 0 },
  { code: 'EXEMPT', name: 'Tax Exempt', rate: 0 },
  { code: 'ZERO', name: 'Zero Rated', rate: 0 },
  { code: 'VAT-SR', name: 'VAT Standard Rate', rate: 7.5 },
  { code: 'VAT-RD', name: 'VAT Reduced Rate', rate: 5 },
  { code: 'GST', name: 'Goods and Services Tax', rate: 10 },
];

export async function seedTaxRates(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

  for (const tax of DEFAULT_TAX_RATES) {
    await tx.taxRate.upsert({
      where: { tenantId_code: { tenantId, code: tax.code } },
      update: { name: tax.name, rate: tax.rate, isInclusive: tax.isInclusive ?? false },
      create: {
        tenantId,
        code: tax.code,
        name: tax.name,
        rate: tax.rate,
        isInclusive: tax.isInclusive ?? false,
      },
    });
  }
}