/**
 * Base unit-of-measure set (G-4 / plan §3). Base units seed first, then derived
 * units link to their base via `baseUnitId` + `factorToBase`. Upserted on the
 * per-tenant `(code)` unique key inside a tenant-armed transaction.
 */
import { Prisma } from '../generated/client';

export interface SeedUnitRow {
  code: string;
  name: string;
  symbol: string;
  /** Code of the base unit this unit converts from. */
  baseCode?: string;
  factorToBase?: number;
}

export const DEFAULT_UNITS: SeedUnitRow[] = [
  { code: 'PCS', name: 'Piece', symbol: 'pcs' },
  { code: 'BOX', name: 'Box', symbol: 'box', baseCode: 'PCS', factorToBase: 12 },
  { code: 'KG', name: 'Kilogram', symbol: 'kg' },
  { code: 'G', name: 'Gram', symbol: 'g', baseCode: 'KG', factorToBase: 0.001 },
  { code: 'L', name: 'Liter', symbol: 'L' },
  { code: 'ML', name: 'Milliliter', symbol: 'ml', baseCode: 'L', factorToBase: 0.001 },
  { code: 'M', name: 'Meter', symbol: 'm' },
  { code: 'CM', name: 'Centimeter', symbol: 'cm', baseCode: 'M', factorToBase: 0.01 },
  { code: 'HRS', name: 'Hour', symbol: 'hr' },
  { code: 'DAY', name: 'Day', symbol: 'day', baseCode: 'HRS', factorToBase: 8 },
];

export async function seedUnits(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

  const baseIds = new Map<string, string>();
  for (const unit of DEFAULT_UNITS) {
    if (unit.baseCode) continue;
    const row = await tx.unit.upsert({
      where: { tenantId_code: { tenantId, code: unit.code } },
      update: { name: unit.name, symbol: unit.symbol },
      create: { tenantId, code: unit.code, name: unit.name, symbol: unit.symbol },
    });
    baseIds.set(unit.code, row.id);
  }

  for (const unit of DEFAULT_UNITS) {
    if (!unit.baseCode || !unit.factorToBase) continue;
    const baseId = baseIds.get(unit.baseCode);
    if (!baseId) throw new Error(`Unit seed: base unit ${unit.baseCode} missing`);
    await tx.unit.upsert({
      where: { tenantId_code: { tenantId, code: unit.code } },
      update: {
        name: unit.name,
        symbol: unit.symbol,
        baseUnitId: baseId,
        factorToBase: unit.factorToBase,
      },
      create: {
        tenantId,
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        baseUnitId: baseId,
        factorToBase: unit.factorToBase,
      },
    });
  }
}