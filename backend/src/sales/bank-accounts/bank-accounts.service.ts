import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.bankAccount.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, input: { name: string; accountNumber?: string; accountName?: string; currency?: string; openingBalance?: number }) {
    if (!input.name.trim()) throw new BadRequestException('Bank account name is required');
    const account = await this.prisma.bankAccount.create({
      data: {
        tenantId: user.tenantId,
        name: input.name.trim(),
        accountNumber: input.accountNumber ?? undefined,
        accountName: input.accountName ?? undefined,
        currency: input.currency || 'USD',
        openingBalance: input.openingBalance ?? 0,
      },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'bank_account.create',
      entityType: 'bank_account',
      entityId: account.id,
      newValues: input,
    });
    return account;
  }

  async update(user: AuthUser, id: string, input: Record<string, unknown>) {
    const existing = await this.prisma.bankAccount.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundException('Bank account not found in this workspace');
    const updated = await this.prisma.bankAccount.update({ where: { id }, data: input as never });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'bank_account.update',
      entityType: 'bank_account',
      entityId: id,
      oldValues: existing,
      newValues: input,
    });
    return updated;
  }
}
