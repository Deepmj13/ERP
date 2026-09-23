import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';

export interface SalesOrderItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string;
  sortOrder?: number;
}

export interface CreateSalesOrderInput {
  customerId: string;
  branchId?: string;
  currency?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  items: SalesOrderItemInput[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.salesOrder.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { customer: { name: { contains: q, mode: 'insensitive' } } } : {}),
        ...(status ? { status } : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true, deliveries: { select: { id: true, status: true } } },
    });
    if (!doc) throw new NotFoundException('Sales order not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateSalesOrderInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.salesOrder.create({
        data: {
          tenantId: user.tenantId,
          customerId: input.customerId,
          branchId: input.branchId,
          currency: input.currency || 'USD',
          expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
          notes: input.notes,
          createdById: user.userId,
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
      return created;
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'sales_order.create', entityType: 'sales_order', entityId: doc.id, newValues: input,
    });
    return this.get(user, doc.id);
  }

  async update(user: AuthUser, id: string, input: Record<string, unknown>) {
    const doc = await this.prisma.salesOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Sales order not found');
    if (doc.status !== 'DRAFT') throw new BadRequestException('Only draft orders can be edited');
    const allowed: Record<string, unknown> = {};
    for (const key of ['customerId', 'branchId', 'currency', 'expectedDeliveryDate', 'notes']) {
      if (input[key] !== undefined) allowed[key] = input[key];
    }
    return this.prisma.salesOrder.update({ where: { id }, data: allowed as never });
  }

  async submit(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'DRAFT', 'SUBMITTED');
    await this.approvals.recordSubmit(user, 'SALES_ORDER', id);
    return doc;
  }

  async approve(user: AuthUser, id: string) {
    let approvedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.transitionInTx(tx, user, id, 'SUBMITTED', 'APPROVED');
      const number = await this.numbering.allocateNumber(user.tenantId, 'SO', { prefix: 'SO-' }, tx as never);
      approvedNumber = number.number;
      await tx.salesOrder.update({ where: { id }, data: { number: number.number, approvedById: user.userId, approvedAt: new Date() } });
    });
    await this.approvals.recordDecision(user, 'SALES_ORDER', id, approvedNumber, 'APPROVED');
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.salesOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Sales order not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) throw new BadRequestException('Cannot cancel order in current status');
    return this.prisma.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => this.transitionInTx(tx, user, id, from, to));
  }

  private async transitionInTx(tx: Prisma.TransactionClient, user: AuthUser, id: string, from: string, to: string) {
    const doc = await tx.salesOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Sales order not found');
    if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
    return tx.salesOrder.update({ where: { id }, data: { status: to } });
  }

  private async recalcTotals(tx: Prisma.TransactionClient, id: string) {
    const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: id } });
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    for (const item of items) {
      const lineBeforeTax = new Prisma.Decimal(item.unitPrice).mul(item.quantity).mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      const discAmt = new Prisma.Decimal(item.unitPrice).mul(item.quantity).sub(lineBeforeTax);
      await tx.salesOrderItem.update({ where: { id: item.id }, data: { discountAmt: discAmt, lineTotal: lineBeforeTax } });
      subtotal = subtotal.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity));
      discountTotal = discountTotal.add(discAmt);
      taxTotal = taxTotal.add(item.taxAmount);
    }
    const total = subtotal.sub(discountTotal).add(taxTotal);
    await tx.salesOrder.update({ where: { id }, data: { subtotal, discountTotal, taxTotal, total } });
  }
}