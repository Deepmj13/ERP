import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { FinanceService } from '../../finance/finance.service';

export interface VendorPaymentAllocationInput {
  vendorBillId: string;
  amount: number;
}

export interface CreateVendorPaymentInput {
  vendorId: string;
  bankAccountId?: string;
  amount: number;
  method: string;
  reference?: string;
  allocations: VendorPaymentAllocationInput[];
}

@Injectable()
export class VendorPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly finance: FinanceService,
  ) {}

  async list(user: AuthUser, vendorId?: string) {
    return this.prisma.vendorPayment.findMany({
      where: { tenantId: user.tenantId, ...(vendorId ? { vendorId } : {}) },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.vendorPayment.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        vendor: true,
        allocations: {
          include: { vendorBill: { select: { id: true, number: true, total: true } } },
        },
      },
    });
    if (!doc) throw new NotFoundException('Vendor payment not found');
    return doc;
  }

  async create(user: AuthUser, input: CreateVendorPaymentInput) {
    if (!input.allocations?.length)
      throw new BadRequestException('At least one bill allocation is required');
    if (input.amount <= 0) throw new BadRequestException('Payment amount must be positive');
    let allocated = 0;
    for (const a of input.allocations) allocated += a.amount;
    if (allocated > input.amount) {
      throw new BadRequestException('Allocation total exceeds payment amount');
    }
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: input.vendorId, tenantId: user.tenantId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this workspace');

    return this.prisma.vendorPayment.create({
      data: {
        tenantId: user.tenantId,
        vendorId: input.vendorId,
        bankAccountId: input.bankAccountId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        status: 'PENDING',
        createdById: user.userId,
      },
    });
  }

  /** Capture: single tx — allocation to bills, balance math, gapless number. Idempotency-Key guards replay. */
  async capture(user: AuthUser, id: string, input: { allocations: VendorPaymentAllocationInput[] }) {
    let capturedNumber: string | undefined;
    const allocations = input.allocations ?? [];
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const payment = await tx.vendorPayment.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!payment) throw new NotFoundException('Vendor payment not found');
      if (payment.status !== 'PENDING')
        throw new BadRequestException(`Invalid transition: ${payment.status} → CAPTURED`);

      if (!allocations.length) throw new BadRequestException('At least one bill allocation is required');

      for (const allocation of allocations) {
        if (new Prisma.Decimal(allocation.amount).lte(0)) {
          throw new BadRequestException('Allocation amounts must be positive');
        }
        const bill = await tx.vendorBill.findFirst({
          where: {
            id: allocation.vendorBillId,
            tenantId: user.tenantId,
            vendorId: payment.vendorId,
          },
        });
        if (!bill) throw new NotFoundException(`Vendor bill ${allocation.vendorBillId} not found for this vendor`);
        if (bill.status !== 'POSTED') {
          throw new BadRequestException(`Vendor bill ${bill.id} must be posted before allocation`);
        }
        if (new Prisma.Decimal(allocation.amount).gt(bill.balance)) {
          throw new BadRequestException(
            `Allocation ${allocation.amount} exceeds outstanding balance ${bill.balance} on vendor bill ${bill.id}`,
          );
        }

        await tx.vendorPaymentAllocation.create({
          data: {
            tenantId: user.tenantId,
            vendorPaymentId: id,
            vendorBillId: allocation.vendorBillId,
            amount: allocation.amount,
          },
        });

        const newPaid = new Prisma.Decimal(bill.paidAmount).add(allocation.amount);
        const newBalance = new Prisma.Decimal(bill.balance).sub(allocation.amount);
        const newStatus = newBalance.eq(0) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.vendorBill.update({
          where: { id: allocation.vendorBillId },
          data: { paidAmount: newPaid, balance: newBalance, status: newStatus },
        });
      }

      const number = await this.numbering.allocateNumber(
        user.tenantId,
        'VP',
        { prefix: 'VP-', mode: 'gapless' },
        tx as never,
      );
      capturedNumber = number.number;
      await tx.vendorPayment.update({
        where: { id },
        data: { status: 'CAPTURED', number: number.number, paidAt: new Date() },
      });
      // Phase 5/6: same transaction posts the AP / bank entry.
      await this.finance.postVendorPayment(tx, user.tenantId, id, user.userId);
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'vendor_payment.capture',
      entityType: 'vendor_payment',
      entityId: id,
      newValues: { number: capturedNumber, allocations },
    });
    return this.get(user, id);
  }

  /** Void only when nothing was allocated yet. */
  async voidPayment(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const payment = await tx.vendorPayment.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Vendor payment not found');
      if (payment.status !== 'PENDING') throw new BadRequestException('Only pending payments can be voided');
      if (payment.allocations.length > 0) {
        throw new BadRequestException('Cannot void a payment with allocations');
      }
      return tx.vendorPayment.update({ where: { id }, data: { status: 'VOID' } });
    });
  }
}