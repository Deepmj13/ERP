import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberingService } from '../common/database/document-numbering.service';

/** Seeded COA account codes (database/seeds/system/chart-of-accounts.ts). */
export const CODE_ACCOUNTS_RECEIVABLE = '1103';
export const CODE_BANK = '1102';
export const CODE_SALES_REVENUE = '4101';
export const CODE_OUTPUT_TAX = '2102';

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  narration?: string;
}

export interface PostJournalInput {
  entryDate: Date;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  lines: JournalLineInput[];
  createdById?: string;
  assignNumber?: boolean;
}

export interface PostJournalResult {
  entryId: string;
  number: string | null;
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
}

/**
 * Double-entry posting core (plan §15 / rule 6 — immutable after posting,
 * reversals only). All mutation runs inside an already-armed `withTenant`
 * transaction and enforces:
 *
 *  1. each line is debit XOR credit (schema CHECK is the backstop);
 *  2. SUM(debit) = SUM(credit) before any row is written;
 *  3. the referenced fiscal period must be open (no period row = implicit open,
 *     so tenants that haven't seeded periods can still post);
 *  4. auto-generated entries carry `JE-` numbers (gapped via G-1).
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
  ) {}

  /**
   * Posts an invoice to the ledger (AR debit / Revenue + Output Tax credit)
   * inside the caller's transaction. Called by InvoicesService.post().
   */
  async postInvoice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    createdById?: string,
  ): Promise<PostJournalResult> {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, referenceType: 'INVOICE', referenceId: invoiceId },
    });
    if (existing) return { entryId: existing.id, number: existing.number, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit };

    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true },
    });
    if (!invoice) throw new BadRequestException(`Invoice ${invoiceId} not found for posting`);
    if (invoice.status !== 'POSTED') {
      throw new BadRequestException(`Invoice must be POSTED before journaling (got ${invoice.status})`);
    }

    const ar = await this.resolveAccount(tx, tenantId, CODE_ACCOUNTS_RECEIVABLE);
    const revenue = await this.resolveAccount(tx, tenantId, CODE_SALES_REVENUE);
    const outputTax = await this.resolveAccount(tx, tenantId, CODE_OUTPUT_TAX);

    const netRevenue = new Prisma.Decimal(invoice.subtotal).sub(invoice.discountTotal);
    const tax = invoice.taxTotal;
    const total = invoice.total;

    if (!(await this.isPeriodPostable(tx, tenantId, invoice.issueDate))) {
      throw new BadRequestException(`Fiscal period for ${invoice.issueDate.toISOString()} is closed`);
    }

    return this.post(tx, tenantId, {
      entryDate: invoice.issueDate,
      referenceType: 'INVOICE',
      referenceId: invoice.id,
      description: `Invoice ${invoice.number ?? invoice.id}`,
      createdById,
      assignNumber: true,
      lines: [
        { accountId: ar.id, debit: total.toNumber(), narration: 'AR from invoice' },
        { accountId: revenue.id, credit: netRevenue.toNumber(), narration: 'Sales revenue' },
        { accountId: outputTax.id, credit: tax.toNumber(), narration: 'Output tax' },
      ],
    });
  }

  /**
   * Posts a captured payment to the ledger (Bank debit / AR credit) inside the
   * caller's transaction. Called by PaymentsService.capture().
   */
  async postPayment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    paymentId: string,
    createdById?: string,
  ): Promise<PostJournalResult> {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, referenceType: 'PAYMENT', referenceId: paymentId },
    });
    if (existing) return { entryId: existing.id, number: existing.number, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit };

    const payment = await tx.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: { allocations: true },
    });
    if (!payment) throw new BadRequestException(`Payment ${paymentId} not found for posting`);
    if (payment.status !== 'CAPTURED') {
      throw new BadRequestException(`Payment must be CAPTURED before journaling (got ${payment.status})`);
    }

    let allocated = new Prisma.Decimal(0);
    for (const a of payment.allocations) allocated = allocated.add(a.amount);

    let bankAccountId: string;
    if (payment.bankAccountId) {
      const bank = await tx.bankAccount.findFirst({ where: { id: payment.bankAccountId, tenantId } });
      bankAccountId = bank?.accountId ?? CODE_BANK;
    } else {
      bankAccountId = CODE_BANK;
    }
    const bank = await this.resolveAccount(tx, tenantId, bankAccountId);
    const ar = await this.resolveAccount(tx, tenantId, CODE_ACCOUNTS_RECEIVABLE);

    if (!(await this.isPeriodPostable(tx, tenantId, payment.paidAt ?? new Date()))) {
      throw new BadRequestException('Fiscal period for the payment date is closed');
    }

    return this.post(tx, tenantId, {
      entryDate: payment.paidAt ?? new Date(),
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      description: `Payment ${payment.number ?? payment.id}`,
      createdById,
      assignNumber: true,
      lines: [
        { accountId: bank.id, debit: allocated.toNumber(), narration: 'Receipt to bank' },
        { accountId: ar.id, credit: allocated.toNumber(), narration: 'AR settlement' },
      ],
    });
  }

  /**
   * Core posting primitive: validates balance, resolves the fiscal period,
   * and writes the entry + lines (optionally numbered via G-1).
   * Never call outside a tenant-armed transaction.
   */
  async post(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: PostJournalInput,
  ): Promise<PostJournalResult> {
    if (!input.lines?.length) throw new BadRequestException('Journal entry requires at least one line');

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    const lines: Prisma.JournalEntryLineUncheckedCreateWithoutJournalEntryInput[] = [];
    for (const line of input.lines) {
      const debit = new Prisma.Decimal(line.debit ?? 0);
      const credit = new Prisma.Decimal(line.credit ?? 0);
      if (debit.lt(0) || credit.lt(0)) throw new BadRequestException('Line amounts cannot be negative');
      if (debit.gt(0) && credit.gt(0)) {
        throw new BadRequestException('A line is either a debit or a credit, never both');
      }
      if (debit.eq(0) && credit.eq(0)) {
        throw new BadRequestException('A line must have a non-zero amount');
      }
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
      lines.push({
        tenantId,
        accountId: line.accountId,
        debit,
        credit,
        narration: line.narration,
      });
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(`Journal entry does not balance: debit ${totalDebit} ≠ credit ${totalCredit}`);
    }

    if (!(await this.isPeriodPostable(tx, tenantId, input.entryDate))) {
      throw new BadRequestException(`Fiscal period for ${input.entryDate.toISOString()} is closed`);
    }

    const number = input.assignNumber
      ? (await this.numbering.allocateNumber(tenantId, 'JE', { prefix: 'JE-' }, tx as never)).number
      : null;

    const entry = await tx.journalEntry.create({
      data: {
        tenantId,
        number,
        entryDate: input.entryDate,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        totalDebit,
        totalCredit,
        status: 'POSTED',
        createdById: input.createdById,
        postedAt: new Date(),
        lines: { create: lines },
      },
      include: { lines: true },
    });
    return { entryId: entry.id, number: entry.number, totalDebit: entry.totalDebit, totalCredit: entry.totalCredit };
  }

  /** Resolves a seeded/normal account by per-tenant code. */
  async resolveAccount(
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string,
  ): Promise<{ id: string; code: string; name: string }> {
    const account = await tx.account.findFirst({ where: { tenantId, code } });
    if (!account) {
      throw new BadRequestException(`Chart of accounts is not seeded for this tenant (missing ${code})`);
    }
    return { id: account.id, code: account.code, name: account.name };
  }

  /**
   * Posting guard: a matching fiscal period must be OPEN; when no period row
   * exists the tenant is treated as implicitly open (COA/fiscal setup is
   * optional before Finance goes live — see plan §15 posting rules).
   */
  async isPeriodPostable(tx: Prisma.TransactionClient, tenantId: string, date: Date): Promise<boolean> {
    const period = await tx.fiscalPeriod.findFirst({
      where: { tenantId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (!period) return true;
    return period.status === 'OPEN';
  }
}