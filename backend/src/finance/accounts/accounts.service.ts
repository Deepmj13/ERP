import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateAccountInput {
  accountGroupId: string;
  code: string;
  name: string;
  type: string;
  openingDebit?: number;
  openingCredit?: number;
}

export interface UpdateAccountInput {
  name?: string;
  isActive?: boolean;
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, type?: string, q?: string, group?: string) {
    return this.prisma.account.findMany({
      where: {
        tenantId: user.tenantId,
        ...(type ? { type } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(group ? { accountGroupId: group } : {}),
      },
      include: { accountGroup: { select: { id: true, code: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async accountGroups(user: AuthUser) {
    return this.prisma.accountGroup.findMany({
      where: { tenantId: user.tenantId },
      include: { children: { orderBy: { code: 'asc' } } },
      orderBy: { code: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { accountGroup: { select: { id: true, code: true, name: true } } },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(user: AuthUser, input: CreateAccountInput) {
    const account = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const group = await tx.accountGroup.findFirst({
        where: { id: input.accountGroupId, tenantId: user.tenantId },
      });
      if (!group) throw new NotFoundException('Account group not found');
      return tx.account.create({
        data: {
          tenantId: user.tenantId,
          accountGroupId: input.accountGroupId,
          code: input.code,
          name: input.name,
          type: input.type,
          openingDebit: input.openingDebit ?? 0,
          openingCredit: input.openingCredit ?? 0,
        },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'account.create', entityType: 'account', entityId: account.id, newValues: input,
    });
    return account;
  }

  async update(user: AuthUser, id: string, input: UpdateAccountInput) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const account = await tx.account.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!account) throw new NotFoundException('Account not found');
      if (account.isSystem) {
        throw new BadRequestException('System accounts (seeded COA) are protected from editing');
      }
      const updated = await tx.account.update({ where: { id }, data: input });
      return updated;
    });
  }
}