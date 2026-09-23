import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../database';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { StockLedgerService } from './stock-ledger.service';

export interface AdjustStockLine {
  warehouseId: string;
  productId: string;
  quantity: number;
  reason?: string;
  unitCost?: number;
}

export interface TransferLine {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
}

export interface StocktakeLine {
  warehouseId: string;
  productId: string;
  counted: number;
  reason?: string;
}

const DEFAULT_LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: StockLedgerService,
  ) {}

  /** On-hand / available per warehouse. Stock is denormalized on stock_balances (raw SQL documented in sql/stock.sql). */
  async listBalances(user: AuthUser, warehouseId?: string, productId?: string, q?: string) {
    const rows = await this.prisma.stockBalance.findMany({
      where: {
        tenantId: user.tenantId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(productId ? { productId } : {}),
        ...(q ? { product: { is: { name: { contains: q, mode: 'insensitive' } } } } : {}),
      },
      include: { product: true, warehouse: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      available: new Prisma.Decimal(row.quantity).sub(row.reservedQty),
    }));
  }

  /** Auditable movement ledger with server-side filters. */
  async listMovements(
    user: AuthUser,
    filters: {
      productId?: string;
      warehouseId?: string;
      type?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.prisma.stockMovement.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Products at or below a threshold — drives low-stock alerts (Phase 8 title). */
  async listLowStock(user: AuthUser, threshold?: number) {
    const limit = threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const rows = await this.prisma.stockBalance.findMany({
      where: { tenantId: user.tenantId, quantity: { lte: limit } },
      include: { product: true, warehouse: true },
      orderBy: { quantity: 'asc' },
    });
    return rows.map((row) => ({
      ...row,
      available: new Prisma.Decimal(row.quantity).sub(row.reservedQty),
    }));
  }

  async listSerials(user: AuthUser, productId?: string, status?: string) {
    return this.prisma.serialNumber.findMany({
      where: {
        tenantId: user.tenantId,
        ...(productId ? { productId } : {}),
        ...(status ? { status } : {}),
      },
      include: { product: { select: { id: true, name: true, sku: true } }, batch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listBatches(user: AuthUser, productId?: string) {
    return this.prisma.batch.findMany({
      where: {
        tenantId: user.tenantId,
        ...(productId ? { productId } : {}),
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** ADJUSTMENT movement: signed delta plus a required reason (auditable). */
  async adjust(user: AuthUser, line: AdjustStockLine) {
    await this.ensureReferences(user, line.warehouseId, line.productId);
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.ledger.applyMovement(tx, {
        tenantId: user.tenantId,
        warehouseId: line.warehouseId,
        productId: line.productId,
        quantity: Number(line.quantity),
        type: 'ADJUSTMENT',
        referenceType: 'ADJUSTMENT',
        reason: line.reason ?? 'Manual adjustment',
        unitCost: line.unitCost,
        createdById: user.userId,
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'stock.adjust',
      entityType: 'stock',
      entityId: line.productId,
      newValues: line,
    });
    return { ok: true };
  }

  /** Warehouse-to-warehouse transfer: TRANSFER_OUT + TRANSFER_IN in one tx, net zero. */
  async transfer(user: AuthUser, lines: TransferLine[]) {
    if (!lines?.length) throw new BadRequestException('At least one transfer line is required');
    for (const line of lines) {
      if (Number(line.quantity) <= 0)
        throw new BadRequestException('Transfer quantity must be positive');
      if (line.fromWarehouseId === line.toWarehouseId) {
        throw new BadRequestException('Source and destination warehouses must differ');
      }
    }
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      for (const line of lines) {
        await this.intraTenantReference(
          tx,
          user.tenantId,
          line.toWarehouseId,
          line.productId,
          'Warehouse',
          'Product',
        );
        await this.ledger.applyMovement(tx, {
          tenantId: user.tenantId,
          warehouseId: line.fromWarehouseId,
          productId: line.productId,
          quantity: -Number(line.quantity),
          type: 'TRANSFER_OUT',
          referenceType: 'STOCK_TRANSFER',
          reason: line.reason ?? 'Stock transfer',
          createdById: user.userId,
        });
        await this.ledger.applyMovement(tx, {
          tenantId: user.tenantId,
          warehouseId: line.toWarehouseId,
          productId: line.productId,
          quantity: Number(line.quantity),
          type: 'TRANSFER_IN',
          referenceType: 'STOCK_TRANSFER',
          reason: line.reason ?? 'Stock transfer',
          createdById: user.userId,
        });
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'stock.transfer',
      entityType: 'stock',
      entityId: lines[0].productId,
      newValues: lines,
    });
    return { ok: true };
  }

  /** Physical count: delta = counted - on-hand, recorded as STOCKTAKE. */
  async stocktake(user: AuthUser, line: StocktakeLine) {
    await this.ensureReferences(user, line.warehouseId, line.productId);
    let countAdjustment = 0;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const [row] = await tx.$queryRaw<BalanceRow[]>`
        SELECT (quantity)::text AS quantity FROM stock_balances
        WHERE warehouse_id = ${line.warehouseId}::uuid AND product_id = ${line.productId}::uuid
        FOR UPDATE
      `;
      const onHand = row ? Number(row.quantity) : 0;
      countAdjustment = Number(line.counted) - onHand;
      if (countAdjustment === 0) return;
      await this.ledger.applyMovement(tx, {
        tenantId: user.tenantId,
        warehouseId: line.warehouseId,
        productId: line.productId,
        quantity: countAdjustment,
        type: 'STOCKTAKE',
        referenceType: 'STOCKTAKE',
        reason: line.reason ?? `Counted ${line.counted}`,
        createdById: user.userId,
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'stock.stocktake',
      entityType: 'stock',
      entityId: line.productId,
      newValues: { ...line, adjustment: countAdjustment },
    });
    return { ok: true, adjustment: countAdjustment };
  }

  private async ensureReferences(user: AuthUser, warehouseId: string, productId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId: user.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found in this workspace');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: user.tenantId },
    });
    if (!product) throw new NotFoundException('Product not found in this workspace');
  }

  private async intraTenantReference(
    tx: Prisma.TransactionClient,
    tenantId: string,
    warehouseId: string,
    productId: string,
    _warehouseLabel: string,
    _productLabel: string,
  ) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!warehouse)
      throw new NotFoundException('Destination warehouse not found in this workspace');
    const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found in this workspace');
  }
}

interface BalanceRow {
  quantity: string;
}
