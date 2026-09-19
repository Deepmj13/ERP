import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateDepartmentInput {
  code: string;
  name: string;
  parentId?: string;
}

export interface UpdateDepartmentInput {
  code?: string;
  name?: string;
  parentId?: string;
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string) {
    return this.prisma.department.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!dept) throw new NotFoundException('Department not found in this workspace');
    return dept;
  }

  async create(user: AuthUser, input: CreateDepartmentInput) {
    if (!input.code?.trim()) throw new BadRequestException('Department code is required');
    if (!input.name?.trim()) throw new BadRequestException('Department name is required');

    if (input.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: input.parentId, tenantId: user.tenantId },
      });
      if (!parent) throw new NotFoundException('Parent department not found in this workspace');
    }

    const dept = await this.prisma.department.create({
      data: {
        tenantId: user.tenantId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        parentId: input.parentId,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'department.create',
      entityType: 'department',
      entityId: dept.id,
      newValues: input,
    });
    return dept;
  }

  async update(user: AuthUser, id: string, input: UpdateDepartmentInput) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!dept) throw new NotFoundException('Department not found in this workspace');

    if (input.parentId) {
      if (input.parentId === id) throw new BadRequestException('A department cannot be its own parent');
      const parent = await this.prisma.department.findFirst({
        where: { id: input.parentId, tenantId: user.tenantId },
      });
      if (!parent) throw new NotFoundException('Parent department not found in this workspace');
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        code: input.code === undefined ? undefined : input.code.trim().toUpperCase(),
        name: input.name?.trim() || undefined,
        parentId: input.parentId,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'department.update',
      entityType: 'department',
      entityId: id,
      oldValues: dept,
      newValues: input,
    });
    return updated;
  }
}