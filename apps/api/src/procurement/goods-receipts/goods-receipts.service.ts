import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { StockLedgerService } from '../../inventory/stock-ledger.service';

export interface GoodsReceiptItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitCost?: number;
  sortOrder?: number;
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId: string;
  warehouseId?: string;
  receiptDate?: string;
  notes?: string;
  items: GoodsReceiptItemInput[];
}

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly ledger: StockLedgerService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.goodsReceipt.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
      },
      include: { purchaseOrder: { select: { id: true, number: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, purchaseOrder: true, warehouse: true },
    });
    if (!doc) throw new NotFoundException('Goods receipt not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateGoodsReceiptInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId: user.tenantId },
    });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (order.status !== 'APPROVED' && !['PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status))
      throw new BadRequestException('Purchase order must be approved before receiving goods');

    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertWarehouse(tx, user.tenantId, input.warehouseId);
      return tx.goodsReceipt.create({
        data: {
          tenantId: user.tenantId,
          purchaseOrderId: input.purchaseOrderId,
          warehouseId: input.warehouseId,
          receiptDate: input.receiptDate ? new Date(input.receiptDate) : undefined,
          notes: input.notes,
          createdById: user.userId,
          items: {
            create: input.items.map((item, i) => ({
              tenantId: user.tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitId: item.unitId,
              unitCost: item.unitCost,
              sortOrder: item.sortOrder ?? i,
            })),
          },
        },
        include: { items: true },
      });
    });
    return this.get(user, doc.id);
  }

  /**
   * Post: stock-in in one transaction — delegates the atomic ledger update to
   * StockLedgerService (PURCHASE movements, positive deltas), then assigns the
   * GRN- number and rolls the purchase order to RECEIVED.
   */
  async post(user: AuthUser, id: string) {
    let postedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.goodsReceipt.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Goods receipt not found');
      if (doc.status !== 'DRAFT')
        throw new BadRequestException(`Invalid transition: ${doc.status} → RECEIVED`);
      if (!doc.warehouseId) throw new BadRequestException('Goods receipt requires a warehouse to post');

      for (const item of doc.items) {
        if (!item.productId) continue;
        await this.ledger.applyMovement(tx, {
          tenantId: user.tenantId,
          warehouseId: doc.warehouseId,
          productId: item.productId,
          quantity: Number(item.quantity),
          type: 'PURCHASE',
          referenceType: 'GRN',
          referenceId: id,
          reason: doc.notes ?? undefined,
          unitCost: item.unitCost !== null && item.unitCost !== undefined ? Number(item.unitCost) : undefined,
          createdById: user.userId,
        });

        await tx.purchaseOrderItem.updateMany({
          where: { purchaseOrderId: doc.purchaseOrderId, productId: item.productId },
          data: { receivedQty: { increment: item.quantity } },
        });
      }

      const number = await this.numbering.allocateNumber(user.tenantId, 'GRN', { prefix: 'GRN-' }, tx as never);
      postedNumber = number.number;
      await tx.goodsReceipt.update({
        where: { id },
        data: { status: 'RECEIVED', number: number.number, postedById: user.userId, postedAt: new Date() },
      });

      const fullyReceived = await this.allItemsReceived(tx, doc.purchaseOrderId);
      await tx.purchaseOrder.update({
        where: { id: doc.purchaseOrderId },
        data: { status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'goods_receipt.post',
      entityType: 'goods_receipt',
      entityId: id,
      newValues: { number: postedNumber },
    });
    return this.get(user, id);
  }

  private async allItemsReceived(tx: Prisma.TransactionClient, purchaseOrderId: string): Promise<boolean> {
    const rows = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
    if (rows.length === 0) return false;
    return rows.every((r) => Number(r.receivedQty) >= Number(r.quantity));
  }

  private async assertWarehouse(tx: Prisma.TransactionClient, tenantId: string, warehouseId?: string) {
    if (!warehouseId) return;
    const w = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!w) throw new BadRequestException('Warehouse not found in this workspace');
  }
}