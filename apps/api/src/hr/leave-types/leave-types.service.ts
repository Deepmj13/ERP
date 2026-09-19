import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  entitlementDays?: number;
}

export interface UpdateLeaveTypeInput {
  code?: string;
  name?: string;
  entitlementDays?: number;
}

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string) {
    return this.prisma.leaveType.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found in this workspace');
    return leaveType;
  }

  async create(user: AuthUser, input: CreateLeaveTypeInput) {
    if (!input.code?.trim()) throw new BadRequestException('Leave type code is required');
    if (!input.name?.trim()) throw new BadRequestException('Leave type name is required');
    if ((input.entitlementDays ?? 0) < 0) throw new BadRequestException('Entitlement days cannot be negative');

    const leaveType = await this.prisma.leaveType.create({
      data: {
        tenantId: user.tenantId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        entitlementDays: input.entitlementDays ?? 0,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'leave_type.create',
      entityType: 'leave_type',
      entityId: leaveType.id,
      newValues: input,
    });
    return leaveType;
  }

  async update(user: AuthUser, id: string, input: UpdateLeaveTypeInput) {
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found in this workspace');
    if ((input.entitlementDays ?? 0) < 0) throw new BadRequestException('Entitlement days cannot be negative');

    const updated = await this.prisma.leaveType.update({
      where: { id },
      data: {
        code: input.code === undefined ? undefined : input.code.trim().toUpperCase(),
        name: input.name?.trim() || undefined,
        entitlementDays: input.entitlementDays,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'leave_type.update',
      entityType: 'leave_type',
      entityId: id,
      oldValues: leaveType,
      newValues: input,
    });
    return updated;
  }
}