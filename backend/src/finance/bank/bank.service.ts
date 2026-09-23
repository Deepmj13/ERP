import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface BankTransactionImportRow {
  bankAccountId: string;
  entryDate: string;
  amount: number;
  description?: string;
  reference?: string;
}

@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, bankAccountId?: string, status?: string) {
    return this.prisma.bankTransaction.findMany({
      where: {
        tenantId: user.tenantId,
        ...(bankAccountId ? { bankAccountId } : {}),
        ...(status ? { status } : {}),
      },
      include: { bankAccount: { select: { id: true, name: true } } },
      orderBy: { entryDate: 'desc' },
    });
  }

  async import(user: AuthUser, rows: BankTransactionImportRow[]) {
    if (!rows?.length) throw new BadRequestException('No bank transaction rows supplied');
    const created = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const out: Array<{ id: string; reference: string | null; amount: number }> = [];
      for (const row of rows) {
        const account = await tx.bankAccount.findFirst({
          where: { id: row.bankAccountId, tenantId: user.tenantId },
        });
        if (!account) throw new NotFoundException(`Bank account ${row.bankAccountId} not found`);
        const txn = await tx.bankTransaction.create({
          data: {
            tenantId: user.tenantId,
            bankAccountId: row.bankAccountId,
            entryDate: new Date(row.entryDate),
            amount: row.amount,
            description: row.description,
            reference: row.reference,
          },
        });
        out.push({ id: txn.id, reference: txn.reference, amount: Number(txn.amount) });
      }
      return out;
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'bank.import', entityType: 'bank_transaction', entityId: created.map((r) => r.id).join(','),
      newValues: { imported: created.length },
    });
    return created;
  }

  async reconcile(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const txn = await tx.bankTransaction.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!txn) throw new NotFoundException('Bank transaction not found');
      if (txn.status === 'RECONCILED') throw new BadRequestException('Transaction is already reconciled');
      return tx.bankTransaction.update({ where: { id }, data: { status: 'RECONCILED' } });
    });
  }

  /** Match a bank transaction to a posted journal entry for bank-gap analysis. */
  async match(user: AuthUser, id: string, journalEntryId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const txn = await tx.bankTransaction.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!txn) throw new NotFoundException('Bank transaction not found');
      const entry = await tx.journalEntry.findFirst({
        where: { id: journalEntryId, tenantId: user.tenantId, status: 'POSTED' },
      });
      if (!entry) throw new NotFoundException('Posted journal entry not found');
      return tx.bankTransaction.update({
        where: { id },
        data: { status: 'MATCHED', journalEntryId },
      });
    });
  }
}