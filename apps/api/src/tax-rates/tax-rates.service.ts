import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateTaxRateInput {
  name: string;
  code: string;
  rate: number;
  isInclusive?: boolean;
}

export interface UpdateTaxRateInput {
  name?: string;
  code?: string;
  rate?: number;
  isInclusive?: boolean;
  isActive?: boolean;
}

@Injectable()
export class TaxRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.taxRate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, input: CreateTaxRateInput) {
    if (!input.name.trim()) throw new BadRequestException('Tax rate name is required');
    if (!input.code.trim()) throw new BadRequestException('Tax rate code is required');
    if (input.rate < 0 || input.rate > 100) {
      throw new BadRequestException('Tax rate must be between 0 and 100');
    }

    const taxRate = await this.prisma.taxRate.create({
      data: {
        tenantId: user.tenantId,
        name: input.name.trim(),
        code: input.code.trim(),
        rate: input.rate,
        isInclusive: input.isInclusive ?? false,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'tax_rate.create',
      entityType: 'tax_rate',
      entityId: taxRate.id,
      newValues: input,
    });
    return taxRate;
  }

  async update(user: AuthUser, id: string, input: UpdateTaxRateInput) {
    const taxRate = await this.prisma.taxRate.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!taxRate) throw new NotFoundException('Tax rate not found in this workspace');
    if (input.rate !== undefined && (input.rate < 0 || input.rate > 100)) {
      throw new BadRequestException('Tax rate must be between 0 and 100');
    }

    const updated = await this.prisma.taxRate.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        code: input.code?.trim() || undefined,
        rate: input.rate,
        isInclusive: input.isInclusive,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'tax_rate.update',
      entityType: 'tax_rate',
      entityId: id,
      oldValues: taxRate,
      newValues: input,
    });
    return updated;
  }
}
