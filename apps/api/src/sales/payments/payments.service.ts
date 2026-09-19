import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { FinanceService } from '../../finance/finance.service';
import { NotificationsService } from '../../ops/notifications/notifications.service';

export interface PaymentAllocationInput {
  invoiceId: string;
  amount: number;
}

export interface CreatePaymentInput {
  customerId: string;
  bankAccountId?: string;
  amount: number;
  method: string;
  reference?: string;
  allocations: PaymentAllocationInput[];
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, customerId?: string) {
    return this.prisma.payment.findMany({
      where: { tenantId: user.tenantId, ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.payment.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        customer: true,
        allocations: { include: { invoice: { select: { id: true, number: true, total: true } } } },
      },
    });
    if (!doc) throw new NotFoundException('Payment not found');
    return doc;
  }

  async create(user: AuthUser, input: CreatePaymentInput) {
    if (!input.allocations?.length) throw new BadRequestException('At least one invoice allocation is required');
    if (input.amount <= 0) throw new BadRequestException('Payment amount must be positive');
    let allocated = 0;
    for (const a of input.allocations) allocated += a.amount;
    if (allocated > input.amount) {
      throw new BadRequestException('Allocation total exceeds payment amount');
    }
    return this.prisma.payment.create({
      data: {
        tenantId: user.tenantId,
        customerId: input.customerId,
        bankAccountId: input.bankAccountId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        status: 'PENDING',
        createdById: user.userId,
      },
    });
  }

  /** Capture: single tx — allocation to invoices, balance math, gapless number. Idempotency-Key guards replay. */
  async capture(user: AuthUser, id: string, input: { allocations: PaymentAllocationInput[] }) {
    let capturedNumber: string | undefined;
    let creatorId: string | undefined;
    const allocations = input.allocations ?? [];
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'PENDING') throw new BadRequestException(`Invalid transition: ${payment.status} → CAPTURED`);
      creatorId = payment.createdById ?? undefined;

      if (!allocations.length) throw new BadRequestException('At least one invoice allocation is required');

      for (const allocation of allocations) {
        if (new Prisma.Decimal(allocation.amount).lte(0)) {
          throw new BadRequestException('Allocation amounts must be positive');
        }
        const invoice = await tx.invoice.findFirst({
          where: { id: allocation.invoiceId, tenantId: user.tenantId, customerId: payment.customerId },
        });
        if (!invoice) throw new NotFoundException(`Invoice ${allocation.invoiceId} not found for this customer`);
        if (invoice.status !== 'POSTED') {
          throw new BadRequestException(`Invoice ${invoice.id} must be posted before allocation`);
        }
        if (new Prisma.Decimal(allocation.amount).gt(invoice.balance)) {
          throw new BadRequestException(
            `Allocation ${allocation.amount} exceeds outstanding balance ${invoice.balance} on invoice ${invoice.id}`,
          );
        }

        await tx.paymentAllocation.create({
          data: {
            tenantId: user.tenantId,
            paymentId: id,
            invoiceId: allocation.invoiceId,
            amount: allocation.amount,
          },
        });

        const newPaid = new Prisma.Decimal(invoice.paidAmount).add(allocation.amount);
        const newBalance = new Prisma.Decimal(invoice.balance).sub(allocation.amount);
        const newStatus = newBalance.eq(0) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.invoice.update({
          where: { id: allocation.invoiceId },
          data: { paidAmount: newPaid, balance: newBalance, status: newStatus },
        });
      }

      const number = await this.numbering.allocateNumber(user.tenantId, 'PAY', { prefix: 'PAY-', mode: 'gapless' }, tx as never);
      capturedNumber = number.number;
      await tx.payment.update({
        where: { id },
        data: { status: 'CAPTURED', number: number.number, paidAt: new Date() },
      });
      // Phase 5: same transaction posts the bank / AR entry.
      await this.finance.postPayment(tx, user.tenantId, id, user.userId);
    });
    if (creatorId && creatorId !== user.userId) {
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: creatorId,
        type: 'payment.captured',
        title: `Payment ${capturedNumber ?? ''} captured`,
        body: 'The payment was captured and applied to its invoices.',
        data: { paymentId: id, number: capturedNumber },
      });
    }
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'payment.capture', entityType: 'payment', entityId: id,
      newValues: { number: capturedNumber, allocations },
    });
    return this.get(user, id);
  }

  /** Void only when nothing was posted downstream from this payment. */
  async voidPayment(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'PENDING') throw new BadRequestException('Only pending payments can be voided');
      if (payment.allocations.length > 0) {
        throw new BadRequestException('Cannot void a payment with allocations');
      }
      return tx.payment.update({ where: { id }, data: { status: 'VOID' } });
    });
  }
}