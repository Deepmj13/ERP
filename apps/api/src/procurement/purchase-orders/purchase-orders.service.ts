import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';

export interface PurchaseOrderItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string;
  sortOrder?: number;
}

export interface CreatePurchaseOrderInput {
  vendorId: string;
  sourceRequestId?: string;
  expectedDeliveryDate?: string;
  currency?: string;
  notes?: string;
  items: PurchaseOrderItemInput[];
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
      },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, vendor: true, sourceRequest: true },
    });
    if (!doc) throw new NotFoundException('Purchase order not found');
    return doc;
  }

  async create(user: AuthUser, input: CreatePurchaseOrderInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: input.vendorId, tenantId: user.tenantId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this workspace');
    if (input.sourceRequestId) {
      const request = await this.prisma.purchaseRequest.findFirst({
        where: { id: input.sourceRequestId, tenantId: user.tenantId },
      });
      if (!request) throw new NotFoundException('Source purchase request not found');
      if (request.status !== 'APPROVED')
        throw new BadRequestException('Source purchase request must be approved before ordering');
    }

    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          tenantId: user.tenantId,
          vendorId: input.vendorId,
          sourceRequestId: input.sourceRequestId,
          currency: input.currency || 'USD',
          expectedDeliveryDate: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : undefined,
          notes: input.notes,
          createdById: user.userId,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          total: 0,
          items: {
            create: input.items.map((item, i) => ({
              tenantId: user.tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitId: item.unitId,
              unitPrice: item.unitPrice,
              discountPct: item.discountPct ?? 0,
              taxRateId: item.taxRateId,
              sortOrder: item.sortOrder ?? i,
            })),
          },
        },
        include: { items: true },
      });
      await this.recalcTotals(tx, created.id);
      if (input.sourceRequestId) {
        await tx.purchaseRequest.update({
          where: { id: input.sourceRequestId },
          data: { status: 'ORDERED' },
        });
      }
      return created;
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'purchase_order.create',
      entityType: 'purchase_order',
      entityId: doc.id,
      newValues: input,
    });
    return this.get(user, doc.id);
  }

  async submit(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'DRAFT', 'SUBMITTED');
    await this.approvals.recordSubmit(user, 'PURCHASE_ORDER', id);
    return doc;
  }

  async approve(user: AuthUser, id: string) {
    let approvedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.purchaseOrder.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Purchase order not found');
      if (doc.status !== 'SUBMITTED')
        throw new BadRequestException(`Invalid transition: ${doc.status} → APPROVED`);
      const number = await this.numbering.allocateNumber(user.tenantId, 'PO', { prefix: 'PO-' }, tx as never);
      approvedNumber = number.number;
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'APPROVED', number: number.number, approvedById: user.userId, approvedAt: new Date() },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'purchase_order.approve',
      entityType: 'purchase_order',
      entityId: id,
      newValues: { number: approvedNumber },
    });
    await this.approvals.recordDecision(user, 'PURCHASE_ORDER', id, approvedNumber, 'APPROVED');
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Purchase order not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status))
      throw new BadRequestException('Cannot cancel purchase order in current status');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.purchaseOrder.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Purchase order not found');
      if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
      return tx.purchaseOrder.update({ where: { id }, data: { status: to } });
    });
  }

  private async recalcTotals(tx: Prisma.TransactionClient, id: string) {
    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    for (const item of items) {
      const lineBeforeTax = new Prisma.Decimal(item.unitPrice)
        .mul(item.quantity)
        .mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      const discAmt = new Prisma.Decimal(item.unitPrice).mul(item.quantity).sub(lineBeforeTax);
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { discountAmt: discAmt, lineTotal: lineBeforeTax },
      });
      subtotal = subtotal.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity));
      discountTotal = discountTotal.add(discAmt);
      taxTotal = taxTotal.add(item.taxAmount);
    }
    const total = subtotal.sub(discountTotal).add(taxTotal);
    await tx.purchaseOrder.update({
      where: { id },
      data: { subtotal, discountTotal, taxTotal, total },
    });
  }
}