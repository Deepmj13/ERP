import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { FinanceService } from '../../finance/finance.service';

export interface VendorBillItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  unitPrice: number;
  discountPct?: number;
  taxRateId?: string;
  accountId?: string;
  sortOrder?: number;
}

export interface CreateVendorBillInput {
  vendorId: string;
  purchaseOrderId?: string;
  goodsReceiptId?: string;
  currency?: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  items: VendorBillItemInput[];
}

@Injectable()
export class VendorBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly finance: FinanceService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string, vendorId?: string) {
    return this.prisma.vendorBill.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
        ...(vendorId ? { vendorId } : {}),
      },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.vendorBill.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        vendor: true,
        purchaseOrder: true,
        goodsReceipt: true,
        allocations: { select: { id: true, vendorPaymentId: true, amount: true } },
      },
    });
    if (!doc) throw new NotFoundException('Vendor bill not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateVendorBillInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: input.vendorId, tenantId: user.tenantId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this workspace');

    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const created = await tx.vendorBill.create({
        data: {
          tenantId: user.tenantId,
          vendorId: input.vendorId,
          purchaseOrderId: input.purchaseOrderId,
          goodsReceiptId: input.goodsReceiptId,
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
              accountId: item.accountId,
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
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'vendor_bill.create',
      entityType: 'vendor_bill',
      entityId: doc.id,
      newValues: input,
    });
    return this.get(user, doc.id);
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
      const doc = await tx.vendorBill.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Vendor bill not found');
      if (doc.status !== 'APPROVED')
        throw new BadRequestException(`Invalid transition: ${doc.status} → POSTED`);
      const number = await this.numbering.allocateNumber(
        user.tenantId,
        'VB',
        { prefix: 'VB-', mode: 'gapless' },
        tx as never,
      );
      postedNumber = number.number;
      await tx.vendorBill.update({
        where: { id },
        data: { status: 'POSTED', number: number.number, approvedById: user.userId, approvedAt: new Date() },
      });
      const order = doc.purchaseOrderId
        ? await tx.purchaseOrder.findFirst({ where: { id: doc.purchaseOrderId, tenantId: user.tenantId } })
        : null;
      if (order && ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(order.status)) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: 'BILLED' } });
      }
      // Phase 5/6: same transaction posts the AP / inventory / input-tax entry.
      await this.finance.postVendorBill(tx, user.tenantId, id, user.userId);
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'vendor_bill.post',
      entityType: 'vendor_bill',
      entityId: id,
      newValues: { number: postedNumber },
    });
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.vendorBill.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Vendor bill not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status))
      throw new BadRequestException('Cannot cancel vendor bill in current status');
    return this.prisma.vendorBill.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.vendorBill.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Vendor bill not found');
      if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
      return tx.vendorBill.update({ where: { id }, data: { status: to } });
    });
  }

  private async recalcTotals(tx: Prisma.TransactionClient, id: string) {
    const items = await tx.vendorBillItem.findMany({ where: { vendorBillId: id } });
    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);
    for (const item of items) {
      const lineBeforeTax = new Prisma.Decimal(item.unitPrice)
        .mul(item.quantity)
        .mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      const discAmt = new Prisma.Decimal(item.unitPrice).mul(item.quantity).sub(lineBeforeTax);
      await tx.vendorBillItem.update({
        where: { id: item.id },
        data: { discountAmt: discAmt, lineTotal: lineBeforeTax },
      });
      subtotal = subtotal.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity));
      discountTotal = discountTotal.add(discAmt);
      taxTotal = taxTotal.add(item.taxAmount);
    }
    const total = subtotal.sub(discountTotal).add(taxTotal);
    await tx.vendorBill.update({
      where: { id },
      data: { subtotal, discountTotal, taxTotal, total, balance: total },
    });
  }
}