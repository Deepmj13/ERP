import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { StockLedgerService } from '../../inventory/stock-ledger.service';

export interface DeliveryItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  sortOrder?: number;
}

export interface CreateDeliveryInput {
  salesOrderId: string;
  warehouseId?: string;
  deliveryDate?: string;
  notes?: string;
  items: DeliveryItemInput[];
}

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly ledger: StockLedgerService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.delivery.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
      },
      include: { salesOrder: { select: { id: true, number: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.delivery.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, salesOrder: true, warehouse: true },
    });
    if (!doc) throw new NotFoundException('Delivery not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateDeliveryInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: input.salesOrderId, tenantId: user.tenantId },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status !== 'APPROVED')
      throw new BadRequestException('Sales order must be approved before delivery');

    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertWarehouse(tx, user.tenantId, input.warehouseId);
      return tx.delivery.create({
        data: {
          tenantId: user.tenantId,
          salesOrderId: input.salesOrderId,
          warehouseId: input.warehouseId,
          deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : undefined,
          notes: input.notes,
          createdById: user.userId,
          items: {
            create: input.items.map((item, i) => ({
              tenantId: user.tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitId: item.unitId,
              sortOrder: item.sortOrder ?? i,
            })),
          },
        },
        include: { items: true },
      });
    });
    return this.get(user, doc.id);
  }

  async submit(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.delivery.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Delivery not found');
      if (doc.status !== 'DRAFT')
        throw new BadRequestException(`Invalid transition: ${doc.status} → SUBMITTED`);
      return tx.delivery.update({ where: { id }, data: { status: 'SUBMITTED' } });
    });
  }

  /**
   * Post: stock-out in one transaction. Delegates the atomic ledger update to
   * StockLedgerService (plan §14) — row-locks stock_balances FOR UPDATE,
   * rejects oversell, records the signed SALE movement with the new balance.
   */
  async post(user: AuthUser, id: string) {
    let quantityMap = new Map<string, number>();
    let postedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.delivery.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { items: true },
      });
      if (!doc) throw new NotFoundException('Delivery not found');
      if (doc.status !== 'SUBMITTED')
        throw new BadRequestException(`Invalid transition: ${doc.status} → POSTED`);
      if (!doc.warehouseId) throw new BadRequestException('Delivery requires a warehouse to post');

      quantityMap = new Map<string, number>();
      for (const item of doc.items) {
        if (!item.productId) continue;
        quantityMap.set(
          item.productId,
          (quantityMap.get(item.productId) ?? 0) + Number(item.quantity),
        );
      }

      for (const [productId, qty] of quantityMap) {
        await this.ledger.applyMovement(tx, {
          tenantId: user.tenantId,
          warehouseId: doc.warehouseId,
          productId,
          quantity: -qty,
          type: 'SALE',
          referenceType: 'DELIVERY',
          referenceId: id,
          reason: doc.notes ?? undefined,
          createdById: user.userId,
        });

        await tx.salesOrderItem.updateMany({
          where: { salesOrderId: doc.salesOrderId, productId },
          data: { deliveredQty: { increment: qty } },
        });
      }

      const number = await this.numbering.allocateNumber(
        user.tenantId,
        'DEL',
        { prefix: 'DEL-' },
        tx as never,
      );
      postedNumber = number.number;
      const posted = await tx.delivery.update({
        where: { id },
        data: {
          status: 'POSTED',
          number: number.number,
          postedById: user.userId,
          postedAt: new Date(),
        },
      });

      const fullyDelivered = await this.allItemsDelivered(tx, doc.salesOrderId);
      if (fullyDelivered) {
        await tx.salesOrder.update({
          where: { id: doc.salesOrderId },
          data: { status: 'DELIVERED' },
        });
      } else {
        await tx.salesOrder.update({
          where: { id: doc.salesOrderId },
          data: { status: 'PARTIALLY_DELIVERED' },
        });
      }

      return { posted, quantityMap: Array.from(quantityMap.entries()) };
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'delivery.post',
      entityType: 'delivery',
      entityId: id,
      newValues: { number: postedNumber, items: Array.from(quantityMap.entries()) },
    });
    return this.get(user, id);
  }

  private async allItemsDelivered(
    tx: Prisma.TransactionClient,
    salesOrderId: string,
  ): Promise<boolean> {
    const rows = await tx.salesOrderItem.findMany({ where: { salesOrderId } });
    if (rows.length === 0) return false;
    return rows.every((r) => Number(r.deliveredQty) >= Number(r.quantity));
  }

  private async assertWarehouse(
    tx: Prisma.TransactionClient,
    tenantId: string,
    warehouseId?: string,
  ) {
    if (!warehouseId) return;
    const w = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId } });
    if (!w) throw new BadRequestException('Warehouse not found in this workspace');
  }
}
