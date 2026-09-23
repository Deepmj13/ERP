import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';

export interface QuotationItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string;
  sortOrder?: number;
}

export interface CreateQuotationInput {
  customerId: string;
  branchId?: string;
  currency?: string;
  validUntil?: string;
  notes?: string;
  items: QuotationItemInput[];
}

const VALID_DRAFT_FIELDS = ['customerId', 'branchId', 'currency', 'validUntil', 'notes'] as const;

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.quotation.findMany({
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
    const doc = await this.prisma.quotation.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, customer: true },
    });
    if (!doc) throw new NotFoundException('Quotation not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateQuotationInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.quotation.create({
        data: {
          tenantId: user.tenantId,
          customerId: input.customerId,
          branchId: input.branchId,
          currency: input.currency || 'USD',
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
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
      await this.recalcTotals(tx, created.id, user.tenantId);
      return created;
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'quotation.create', entityType: 'quotation', entityId: doc.id, newValues: input,
    });
    return this.get(user, doc.id);
  }

  async update(user: AuthUser, id: string, input: Record<string, unknown>) {
    const doc = await this.prisma.quotation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Quotation not found');
    if (doc.status !== 'DRAFT') throw new BadRequestException('Only draft quotations can be edited');
    const allowed: Record<string, unknown> = {};
    for (const key of VALID_DRAFT_FIELDS) {
      if (input[key] !== undefined) allowed[key] = input[key];
    }
    return this.prisma.quotation.update({ where: { id }, data: allowed as never });
  }

  async submit(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'DRAFT', 'SUBMITTED');
    await this.approvals.recordSubmit(user, 'QUOTATION', id);
    return doc;
  }

  async approve(user: AuthUser, id: string) {
    let approvedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await this.transitionInTx(tx, user, id, 'SUBMITTED', 'APPROVED');
      const number = await this.numbering.allocateNumber(user.tenantId, 'QTO', { prefix: 'QTO-' }, tx as never);
      approvedNumber = number.number;
      await tx.quotation.update({ where: { id }, data: { number: number.number, approvedById: user.userId, approvedAt: new Date() } });
    });
    await this.approvals.recordDecision(user, 'QUOTATION', id, approvedNumber, 'APPROVED');
    return this.get(user, id);
  }

  async reject(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'SUBMITTED', 'REJECTED');
    await this.approvals.recordDecision(user, 'QUOTATION', id, undefined, 'REJECTED');
    return doc;
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.quotation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Quotation not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) throw new BadRequestException('Cannot cancel quotation in current status');
    return this.prisma.quotation.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async convert(user: AuthUser, id: string) {
    const quote = await this.prisma.quotation.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: true },
    });
    if (!quote) throw new NotFoundException('Quotation not found');
    if (!['APPROVED'].includes(quote.status)) throw new BadRequestException('Only approved quotations can be converted');
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          tenantId: user.tenantId,
          sourceQuotationId: id,
          customerId: quote.customerId,
          branchId: quote.branchId,
          currency: quote.currency,
          notes: quote.notes,
          createdById: user.userId,
          subtotal: quote.subtotal,
          discountTotal: quote.discountTotal,
          taxTotal: quote.taxTotal,
          total: quote.total,
          items: {
            create: quote.items.map((item) => ({
              tenantId: user.tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitId: item.unitId,
              unitPrice: item.unitPrice,
              discountPct: item.discountPct,
              discountAmt: item.discountAmt,
              taxRateId: item.taxRateId,
              taxAmount: item.taxAmount,
              lineTotal: item.lineTotal,
              sortOrder: item.sortOrder,
            })),
          },
        },
        include: { items: true },
      });
      await tx.quotation.update({ where: { id }, data: { status: 'CONVERTED' } });
      return order;
    });
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return this.transitionInTx(tx, user, id, from, to);
    });
  }

  private async transitionInTx(tx: Prisma.TransactionClient, user: AuthUser, id: string, from: string, to: string) {
    const doc = await tx.quotation.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Quotation not found');
    if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
    return tx.quotation.update({ where: { id }, data: { status: to } });
  }

  private async recalcTotals(tx: Prisma.TransactionClient, id: string, tenantId: string) {
    const items = await tx.quotationItem.findMany({ where: { quotationId: id } });
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    for (const item of items) {
      const lineBeforeTax = new Prisma.Decimal(item.unitPrice).mul(item.quantity).mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      const discAmt = new Prisma.Decimal(item.unitPrice).mul(item.quantity).sub(lineBeforeTax);
      await tx.quotationItem.update({ where: { id: item.id }, data: { discountAmt: discAmt, lineTotal: lineBeforeTax } });
      subtotal = subtotal.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity));
      discountTotal = discountTotal.add(discAmt);
      taxTotal = taxTotal.add(item.taxAmount);
    }
    const total = subtotal.sub(discountTotal).add(taxTotal);
    await tx.quotation.update({ where: { id }, data: { subtotal, discountTotal, taxTotal, total } });
  }
}
