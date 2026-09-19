import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../prisma/prisma.service';
import { DocumentNumberingService } from '../common/database/document-numbering.service';

/** Seeded COA account codes (database/seeds/system/chart-of-accounts.ts). */
export const CODE_ACCOUNTS_RECEIVABLE = '1103';
export const CODE_BANK = '1102';
export const CODE_SALES_REVENUE = '4101';
export const CODE_OUTPUT_TAX = '2102';
export const CODE_ACCOUNTS_PAYABLE = '2101';
export const CODE_INPUT_TAX = '1105';
export const CODE_INVENTORY = '1104';
export const CODE_PURCHASES_EXPENSE = '5204';
export const CODE_SALARIES_AND_WAGES = '5201';
export const CODE_SALARIES_PAYABLE = '2104';
export const CODE_PAYROLL_DEDUCTIONS_PAYABLE = '2105';

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
   * Posts a posted vendor bill to the ledger (Inventory/expense/Input Tax
   * debit, Accounts Payable credit) inside the caller's transaction. Called by
   * VendorBillsService.post().
   */
  async postVendorBill(
    tx: Prisma.TransactionClient,
    tenantId: string,
    billId: string,
    createdById?: string,
  ): Promise<PostJournalResult> {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, referenceType: 'VENDOR_BILL', referenceId: billId },
    });
    if (existing) return { entryId: existing.id, number: existing.number, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit };

    const bill = await tx.vendorBill.findFirst({
      where: { id: billId, tenantId },
      include: { items: true },
    });
    if (!bill) throw new BadRequestException(`Vendor bill ${billId} not found for posting`);
    if (bill.status !== 'POSTED') {
      throw new BadRequestException(`Vendor bill must be POSTED before journaling (got ${bill.status})`);
    }

    const ap = await this.resolveAccount(tx, tenantId, CODE_ACCOUNTS_PAYABLE);
    const inputTax = await this.resolveAccount(tx, tenantId, CODE_INPUT_TAX);
    const inventory = bill.goodsReceiptId ? await this.resolveAccount(tx, tenantId, CODE_INVENTORY) : null;
    const defaultExpense = await this.resolveAccount(tx, tenantId, CODE_PURCHASES_EXPENSE);

    const lines: JournalLineInput[] = [];
    const debitByAccount = new Map<string, number>();
    for (const item of bill.items) {
      const net = new Prisma.Decimal(item.unitPrice).mul(item.quantity).mul(new Prisma.Decimal(1).sub(item.discountPct.div(100)));
      if (net.lte(0)) continue;
      const accountId = item.accountId ?? (inventory && item.productId ? inventory.id : defaultExpense.id);
      debitByAccount.set(accountId, new Prisma.Decimal(debitByAccount.get(accountId) ?? 0).add(net).toNumber());
    }
    for (const [accountId, amount] of debitByAccount) {
      lines.push({ accountId, debit: amount, narration: 'Purchase bill' });
    }
    if (bill.taxTotal.gt(0)) {
      lines.push({ accountId: inputTax.id, debit: bill.taxTotal.toNumber(), narration: 'Input tax' });
    }
    lines.push({ accountId: ap.id, credit: bill.total.toNumber(), narration: 'Vendor bill payable' });

    if (!(await this.isPeriodPostable(tx, tenantId, bill.issueDate))) {
      throw new BadRequestException(`Fiscal period for ${bill.issueDate.toISOString()} is closed`);
    }

    return this.post(tx, tenantId, {
      entryDate: bill.issueDate,
      referenceType: 'VENDOR_BILL',
      referenceId: bill.id,
      description: `Vendor bill ${bill.number ?? bill.id}`,
      createdById,
      assignNumber: true,
      lines,
    });
  }

  /**
   * Posts a captured vendor payment to the ledger (AP debit / Bank credit)
   * inside the caller's transaction. Called by VendorPaymentsService.capture().
   */
  async postVendorPayment(
    tx: Prisma.TransactionClient,
    tenantId: string,
    paymentId: string,
    createdById?: string,
  ): Promise<PostJournalResult> {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, referenceType: 'VENDOR_PAYMENT', referenceId: paymentId },
    });
    if (existing) return { entryId: existing.id, number: existing.number, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit };

    const payment = await tx.vendorPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: { allocations: true },
    });
    if (!payment) throw new BadRequestException(`Vendor payment ${paymentId} not found for posting`);
    if (payment.status !== 'CAPTURED') {
      throw new BadRequestException(`Vendor payment must be CAPTURED before journaling (got ${payment.status})`);
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
    const ap = await this.resolveAccount(tx, tenantId, CODE_ACCOUNTS_PAYABLE);

    if (!(await this.isPeriodPostable(tx, tenantId, payment.paidAt ?? new Date()))) {
      throw new BadRequestException('Fiscal period for the payment date is closed');
    }

    return this.post(tx, tenantId, {
      entryDate: payment.paidAt ?? new Date(),
      referenceType: 'VENDOR_PAYMENT',
      referenceId: payment.id,
      description: `Vendor payment ${payment.number ?? payment.id}`,
      createdById,
      assignNumber: true,
      lines: [
        { accountId: ap.id, debit: allocated.toNumber(), narration: 'AP settlement' },
        { accountId: bank.id, credit: allocated.toNumber(), narration: 'Disbursement to bank' },
      ],
    });
  }

  /**
   * Posts a posted payroll run to the ledger (Salaries & Wages expense debit,
   * Salaries Payable + Payroll Deductions Payable credits) inside the caller's
   * transaction. Called by PayrollRunsService.post(). A run may only be posted
   * once — if a PAYROLL entry already exists this throws (no silent replay).
   */
  async postPayrollRun(
    tx: Prisma.TransactionClient,
    tenantId: string,
    runId: string,
    createdById?: string,
  ): Promise<PostJournalResult> {
    const existing = await tx.journalEntry.findFirst({
      where: { tenantId, referenceType: 'PAYROLL', referenceId: runId },
    });
    if (existing) {
      throw new BadRequestException(
        `Payroll run already has a journal entry (${existing.number ?? existing.id})`,
      );
    }

    const run = await tx.payrollRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new BadRequestException(`Payroll run ${runId} not found for posting`);
    if (run.status !== 'POSTED') {
      throw new BadRequestException(`Payroll run must be POSTED before journaling (got ${run.status})`);
    }
    if (run.totalGross.lte(0)) {
      throw new BadRequestException('Payroll run has no gross amount to post');
    }

    const salaries = await this.resolveAccount(tx, tenantId, CODE_SALARIES_AND_WAGES);
    const salariesPayable = await this.resolveAccount(tx, tenantId, CODE_SALARIES_PAYABLE);
    const deductionsPayable = await this.resolveAccount(tx, tenantId, CODE_PAYROLL_DEDUCTIONS_PAYABLE);

    const net = run.totalNet.toNumber();
    const deductions = run.totalDeductions.toNumber();

    const lines: JournalLineInput[] = [
      { accountId: salaries.id, debit: run.totalGross.toNumber(), narration: `Payroll ${run.number} gross` },
    ];
    if (net > 0) lines.push({ accountId: salariesPayable.id, credit: net, narration: 'Net pay payable' });
    if (deductions > 0) {
      lines.push({ accountId: deductionsPayable.id, credit: deductions, narration: 'Payroll deductions payable' });
    }

    return this.post(tx, tenantId, {
      entryDate: run.periodEnd,
      referenceType: 'PAYROLL',
      referenceId: run.id,
      description: `Payroll run ${run.number}`,
      createdById,
      assignNumber: true,
      lines,
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