import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { DocumentsJobService } from '../../jobs/documents.job.service';

export interface InvoiceItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string;
  sortOrder?: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  salesOrderId?: string;
  deliveryId?: string;
  currency?: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  items: InvoiceItemInput[];
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly documents: DocumentsJobService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string, customerId?: string) {
    return this.prisma.invoice.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { customer: { name: { contains: q, mode: 'insensitive' } } } : {}),
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.invoice.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        customer: true,
        allocations: { select: { id: true, paymentId: true, amount: true } },
      },
    });
    if (!doc) throw new NotFoundException('Invoice not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateInvoiceInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          customerId: input.customerId,
          salesOrderId: input.salesOrderId,
          deliveryId: input.deliveryId,
          currency: input.currency || 'USD',
          issueDate: new Date(input.issueDate),
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          notes: input.notes,
          createdById: user.userId,
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          total: 0,
          balance: 0,
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
      action: 'invoice.create', entityType: 'invoice', entityId: doc.id, newValues: input,
    });
    return this.get(user, doc.id);
  }

  async update(user: AuthUser, id: string, input: Record<string, unknown>) {
    const doc = await this.prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Invoice not found');
    if (doc.status !== 'DRAFT') throw new BadRequestException('Only draft invoices can be edited');
    const allowed: Record<string, unknown> = {};
    for (const key of ['customerId', 'salesOrderId', 'deliveryId', 'currency', 'issueDate', 'dueDate', 'notes']) {
      if (input[key] !== undefined) allowed[key] = input[key];
    }
    return this.prisma.invoice.update({ where: { id }, data: allowed as never });
  }

  async submit(user: AuthUser, id: string) {
    return this.transition(user, id, 'DRAFT', 'SUBMITTED');
  }

  async approve(user: AuthUser, id: string) {
    return this.transition(user, id, 'SUBMITTED', 'APPROVED');
  }

  async post(user: AuthUser, id: string) {
    let postedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Invoice not found');
      if (doc.status !== 'APPROVED') throw new BadRequestException(`Invalid transition: ${doc.status} → POSTED`);
      const number = await this.numbering.allocateNumber(user.tenantId, 'INV', { prefix: 'INV-', mode: 'gapless' }, tx as never);
      postedNumber = number.number;
      await tx.invoice.update({
        where: { id },
        data: { status: 'POSTED', number: number.number, approvedById: user.userId, approvedAt: new Date() },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'invoice.post', entityType: 'invoice', entityId: id,
      newValues: { number: postedNumber },
    });
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Invoice not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) throw new BadRequestException('Cannot cancel invoice in current status');
    return this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async queuePdf(user: AuthUser, tenantId: string, id: string): Promise<boolean> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!invoice || invoice.status !== 'POSTED') throw new BadRequestException('Invoice must be posted to generate a PDF');
    await this.documents.queuePdf({
      tenantId,
      documentType: 'INVOICE',
      documentId: id,
      generatedById: user.userId,
    });
    return true;
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.invoice.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Invoice not found');
      if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
      return tx.invoice.update({ where: { id }, data: { status: to } });
    });
  }

  private async recalcTotals(tx: Prisma.TransactionClient, id: string) {
    const items = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    for (const item of items) {
      const lineBeforeTax = new Prisma.Decimal(item.unitPrice).mul(item.quantity).mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      const discAmt = new Prisma.Decimal(item.unitPrice).mul(item.quantity).sub(lineBeforeTax);
      await tx.invoiceItem.update({ where: { id: item.id }, data: { discountAmt: discAmt, lineTotal: lineBeforeTax } });
      subtotal = subtotal.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity));
      discountTotal = discountTotal.add(discAmt);
      taxTotal = taxTotal.add(item.taxAmount);
    }
    const total = subtotal.sub(discountTotal).add(taxTotal);
    await tx.invoice.update({ where: { id }, data: { subtotal, discountTotal, taxTotal, total, balance: total } });
  }
}