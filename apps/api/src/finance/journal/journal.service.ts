import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { FinanceService, JournalLineInput } from '../finance.service';

export interface CreateJournalInput {
  entryDate: string;
  description?: string;
  lines: JournalLineInput[];
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly finance: FinanceService,
  ) {}

  async list(user: AuthUser, from?: string, to?: string, status?: string) {
    const where: Prisma.JournalEntryWhereInput = { tenantId: user.tenantId };
    if (from || to) {
      where.entryDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (status) where.status = status;
    return this.prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
      orderBy: { entryDate: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lines: { include: { account: { select: { id: true, code: true, name: true } } } } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  /** Manual entry is created as DRAFT; number is assigned at post (ADR-0006). */
  async create(user: AuthUser, input: CreateJournalInput) {
    let entryId: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const { entryDate, lines, totalDebit, totalCredit } = await this.validateAndBuild(tx, user, input);
      const entry = await tx.journalEntry.create({
        data: {
          tenantId: user.tenantId,
          entryDate,
          description: input.description,
          totalDebit,
          totalCredit,
          status: 'DRAFT',
          createdById: user.userId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      entryId = entry.id;
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'journal.create', entityType: 'journal_entry', entityId: entryId!, newValues: input,
    });
    return this.get(user, entryId!);
  }

  async post(user: AuthUser, id: string) {
    let number: string | null = null;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { lines: true },
      });
      if (!entry) throw new NotFoundException('Journal entry not found');
      if (entry.status !== 'DRAFT') throw new BadRequestException(`Invalid transition: ${entry.status} → POSTED`);
      if (!(await this.finance.isPeriodPostable(tx, user.tenantId, entry.entryDate))) {
        throw new BadRequestException(`Fiscal period for ${entry.entryDate.toISOString()} is closed`);
      }
      const allocated = await this.numbering.allocateNumber(user.tenantId, 'JE', { prefix: 'JE-' }, tx as never);
      number = allocated.number;
      await tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED', number: allocated.number, postedAt: new Date() },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'journal.post', entityType: 'journal_entry', entityId: id, newValues: { number },
    });
    return this.get(user, id);
  }

  /** Reversal = new posted entry with swapped debits/credits; source → REVERSED. */
  async reverse(user: AuthUser, id: string) {
    let reverseId: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const source = await tx.journalEntry.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { lines: true },
      });
      if (!source) throw new NotFoundException('Journal entry not found');
      if (source.status !== 'POSTED') throw new BadRequestException('Only posted entries can be reversed');
      if (!(await this.finance.isPeriodPostable(tx, user.tenantId, new Date()))) {
        throw new BadRequestException('Reversal target period is closed');
      }
      const number = await this.numbering.allocateNumber(user.tenantId, 'JE', { prefix: 'JE-' }, tx as never);
      const reversed = await tx.journalEntry.create({
        data: {
          tenantId: user.tenantId,
          number: number.number,
          entryDate: new Date(),
          referenceType: source.referenceType,
          referenceId: source.referenceId,
          description: `Reversal of ${source.number ?? source.id}`,
          totalDebit: source.totalCredit,
          totalCredit: source.totalDebit,
          status: 'POSTED',
          reversedById: source.id,
          createdById: user.userId,
          postedAt: new Date(),
          lines: {
            create: source.lines.map((line) => ({
              tenantId: user.tenantId,
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              narration: line.narration,
            })),
          },
        },
      });
      await tx.journalEntry.update({ where: { id: source.id }, data: { status: 'REVERSED' } });
      reverseId = reversed.id;
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'journal.reverse', entityType: 'journal_entry', entityId: id, newValues: { reverseId },
    });
    return this.get(user, reverseId!);
  }

  private async validateAndBuild(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    input: CreateJournalInput,
  ) {
    const entryDate = new Date(input.entryDate);
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    const lines: Prisma.JournalEntryLineUncheckedCreateWithoutJournalEntryInput[] = [];
    for (const line of input.lines) {
      const debit = new Prisma.Decimal(line.debit ?? 0);
      const credit = new Prisma.Decimal(line.credit ?? 0);
      if (debit.lt(0) || credit.lt(0)) throw new BadRequestException('Line amounts cannot be negative');
      if (debit.gt(0) && credit.gt(0)) throw new BadRequestException('A line is either a debit or a credit, never both');
      if (debit.eq(0) && credit.eq(0)) throw new BadRequestException('A line must have a non-zero amount');
      const account = await tx.account.findFirst({ where: { id: line.accountId, tenantId: user.tenantId } });
      if (!account) throw new NotFoundException(`Account ${line.accountId} not found`);
      totalDebit = totalDebit.add(debit);
      totalCredit = totalCredit.add(credit);
      lines.push({ tenantId: user.tenantId, accountId: line.accountId, debit, credit, narration: line.narration });
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(`Journal entry does not balance: debit ${totalDebit} ≠ credit ${totalCredit}`);
    }
    return { entryDate, lines, totalDebit, totalCredit };
  }
}