import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../database';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address?: Record<string, unknown>;
  isActive?: boolean;
}

export interface UpdateWarehouseInput {
  code?: string;
  name?: string;
  address?: Record<string, unknown> | null;
  isActive?: boolean;
}

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string) {
    return this.prisma.warehouse.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { code: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found in this workspace');
    return warehouse;
  }

  async create(user: AuthUser, input: CreateWarehouseInput) {
    if (!input.code?.trim()) throw new BadRequestException('Warehouse code is required');
    if (!input.name?.trim()) throw new BadRequestException('Warehouse name is required');

    const warehouse = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.warehouse.findFirst({
        where: { tenantId: user.tenantId, code: input.code.trim() },
      });
      if (existing)
        throw new BadRequestException('Warehouse code already exists in this workspace');
      return tx.warehouse.create({
        data: {
          tenantId: user.tenantId,
          code: input.code.trim(),
          name: input.name.trim(),
          address: (input.address ?? undefined) as never,
          isActive: input.isActive ?? true,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'warehouse.create',
      entityType: 'warehouse',
      entityId: warehouse.id,
      newValues: input,
    });
    return warehouse;
  }

  async update(user: AuthUser, id: string, input: UpdateWarehouseInput) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found in this workspace');

    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: {
        code: input.code?.trim(),
        name: input.name?.trim(),
        address:
          input.address === undefined ? undefined : ((input.address ?? Prisma.JsonNull) as never),
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'warehouse.update',
      entityType: 'warehouse',
      entityId: id,
      oldValues: warehouse,
      newValues: input,
    });
    return updated;
  }
}
