import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../database';

/**
 * Stock ledger core (plan §14 / rule 5): every quantity change is an auditable
 * StockMovement row. We never mutate a bare `product.stock` counter.
 *
 * applyMovement is the single atomic mutation path — used by delivery posting
 * (SALE), adjustments (ADJUSTMENT), transfers (TRANSFER_OUT/IN) and stocktakes
 * (STOCKTAKE). Runs inside the caller's `withTenant` transaction:
 *  1. negative deltas row-lock stock_balances FOR UPDATE and reject oversell;
 *  2. a parameterized upsert applies the delta and returns the new balance;
 *  3. the movement is inserted with that balance_after from the same statement.
 * See apps/api/sql/stock.sql for the documented SQL.
 */
@Injectable()
export class StockLedgerService {
  /**
   * Applies a signed movement inside an active tenant-armed transaction.
   * `tx` must come from `PrismaService.withTenant`. Throws when a negative
   * delta would take on-hand below zero.
   */
  async applyMovement(
    tx: Prisma.TransactionClient,
    input: StockMovementInput,
  ): Promise<{ balanceAfter: Prisma.Decimal }> {
    const qty = Number(input.quantity);
    if (!Number.isFinite(qty) || qty === 0) {
      throw new BadRequestException('Quantity must be a non-zero number');
    }

    if (qty < 0) {
      const [row] = await tx.$queryRaw<BalanceRow[]>`
        SELECT (quantity)::text AS quantity FROM stock_balances
        WHERE warehouse_id = ${input.warehouseId}::uuid AND product_id = ${input.productId}::uuid
        FOR UPDATE
      `;
      const onHand = row ? Number(row.quantity) : 0;
      if (onHand < Math.abs(qty)) {
        throw new BadRequestException(
          `Insufficient stock for product ${input.productId} in warehouse ${input.warehouseId}: ${onHand} on hand, ${Math.abs(qty)} required`,
        );
      }
    }

    const [updated] = await tx.$queryRaw<BalanceRow[]>`
      INSERT INTO stock_balances (warehouse_id, product_id, tenant_id, quantity, updated_at)
      VALUES (${input.warehouseId}::uuid, ${input.productId}::uuid, ${input.tenantId}::uuid, ${qty}, now())
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = stock_balances.quantity + ${qty}, updated_at = now()
      RETURNING (quantity)::text AS quantity
    `;

    const balanceAfter = new Prisma.Decimal(updated.quantity);
    await tx.stockMovement.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: qty,
        type: input.type,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
        unitCost: input.unitCost !== undefined ? new Prisma.Decimal(input.unitCost) : undefined,
        balanceAfter,
        createdById: input.createdById,
      },
    });

    return { balanceAfter };
  }
}

export interface StockMovementInput {
  tenantId: string;
  warehouseId: string;
  productId: string;
  /** Signed quantity in base units: negative decrements on-hand. */
  quantity: number;
  type: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  unitCost?: number;
  createdById?: string;
}

interface BalanceRow {
  quantity: string;
}
