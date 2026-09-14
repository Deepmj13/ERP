import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateUnitInput {
  name: string;
  code: string;
  symbol?: string;
  baseUnitId?: string;
  factorToBase?: number;
}

export interface UpdateUnitInput {
  name?: string;
  code?: string;
  symbol?: string | null;
  baseUnitId?: string | null;
  factorToBase?: number | null;
  isActive?: boolean;
}

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.unit.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { code: 'asc' },
    });
  }

  async create(user: AuthUser, input: CreateUnitInput) {
    if (!input.name.trim()) throw new BadRequestException('Unit name is required');
    if (!input.code.trim()) throw new BadRequestException('Unit code is required');

    const baseUnitId = await this.resolveBaseUnit(user, input.baseUnitId);

    const unit = await this.prisma.unit.create({
      data: {
        tenantId: user.tenantId,
        name: input.name.trim(),
        code: input.code.trim(),
        symbol: input.symbol?.trim() || undefined,
        baseUnitId,
        factorToBase: input.factorToBase ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'unit.create',
      entityType: 'unit',
      entityId: unit.id,
      newValues: input,
    });
    return unit;
  }

  async update(user: AuthUser, id: string, input: UpdateUnitInput) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!unit) throw new NotFoundException('Unit not found in this workspace');

    let baseUnitId = input.baseUnitId;
    if (input.baseUnitId === undefined) {
      baseUnitId = unit.baseUnitId;
    } else if (input.baseUnitId === null) {
      baseUnitId = null;
    } else {
      baseUnitId = await this.resolveBaseUnit(user, input.baseUnitId);
      if (baseUnitId === id) throw new BadRequestException('A unit cannot be its own base unit');
    }

    const updated = await this.prisma.unit.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        code: input.code?.trim() || undefined,
        symbol: input.symbol === undefined ? undefined : input.symbol?.trim() || null,
        baseUnitId: baseUnitId ?? null,
        factorToBase: input.factorToBase === undefined ? undefined : input.factorToBase,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'unit.update',
      entityType: 'unit',
      entityId: id,
      oldValues: unit,
      newValues: input,
    });
    return updated;
  }

  private async resolveBaseUnit(user: AuthUser, baseUnitId?: string): Promise<string | undefined> {
    if (!baseUnitId) return undefined;
    const base = await this.prisma.unit.findFirst({
      where: { id: baseUnitId, tenantId: user.tenantId },
    });
    if (!base) throw new NotFoundException('Base unit not found in this workspace');
    return base.id;
  }
}
