import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class FiscalPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.fiscalPeriod.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { startDate: 'desc' },
    });
  }

  async create(user: AuthUser, input: { name: string; startDate: string; endDate: string }) {
    const period = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.fiscalPeriod.create({
        data: {
          tenantId: user.tenantId,
          name: input.name,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId, userId: user.userId,
      action: 'period.create', entityType: 'fiscal_period', entityId: period.id, newValues: input,
    });
    return period;
  }

  async close(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!period) throw new NotFoundException('Fiscal period not found');
      if (period.status !== 'OPEN') throw new BadRequestException(`Period is already ${period.status}`);
      return tx.fiscalPeriod.update({ where: { id }, data: { status: 'CLOSED' } });
    });
  }
}