import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

const PROJECT_STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;

export interface CreateProjectInput {
  code: string;
  name: string;
  customerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
}

export interface UpdateProjectInput {
  code?: string;
  name?: string;
  customerId?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.project.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        customer: true,
        tasks: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!project) throw new NotFoundException('Project not found in this workspace');
    return project;
  }

  async create(user: AuthUser, input: CreateProjectInput) {
    if (!input.code?.trim()) throw new BadRequestException('Project code is required');
    if (!input.name?.trim()) throw new BadRequestException('Project name is required');
    this.assertStatus(input.status);

    const project = await this.prisma.withTenant(user.tenantId, async (tx) => {
      if (input.customerId) await this.assertCustomer(tx, user, input.customerId);
      const existing = await tx.project.findFirst({
        where: { tenantId: user.tenantId, code: input.code.trim() },
      });
      if (existing) throw new BadRequestException('Project code already exists in this workspace');

      return tx.project.create({
        data: {
          tenantId: user.tenantId,
          code: input.code.trim(),
          name: input.name.trim(),
          customerId: input.customerId,
          status: input.status ?? 'ACTIVE',
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          budget: input.budget !== undefined ? new Prisma.Decimal(input.budget) : undefined,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'project.create',
      entityType: 'project',
      entityId: project.id,
      newValues: input,
    });
    return this.get(user, project.id);
  }

  async update(user: AuthUser, id: string, input: UpdateProjectInput) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!project) throw new NotFoundException('Project not found in this workspace');
    if (input.status) this.assertStatus(input.status);

    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      if (input.code && input.code.trim() !== project.code) {
        const existing = await tx.project.findFirst({
          where: { tenantId: user.tenantId, code: input.code.trim() },
        });
        if (existing) throw new BadRequestException('Project code already exists in this workspace');
      }
      if (input.customerId) await this.assertCustomer(tx, user, input.customerId);

      return tx.project.update({
        where: { id },
        data: {
          code: input.code?.trim(),
          name: input.name?.trim(),
          customerId: input.customerId === null ? null : input.customerId,
          status: input.status,
          startDate: input.startDate === null ? null : input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate === null ? null : input.endDate ? new Date(input.endDate) : undefined,
          budget:
            input.budget === null
              ? null
              : input.budget !== undefined
                ? new Prisma.Decimal(input.budget)
                : undefined,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'project.update',
      entityType: 'project',
      entityId: id,
      oldValues: project,
      newValues: input,
    });
    return updated;
  }

  private assertStatus(status?: string) {
    if (status && !(PROJECT_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid project status: ${status}`);
    }
  }

  private async assertCustomer(tx: Prisma.TransactionClient, user: AuthUser, customerId: string) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId },
    });
    if (!customer) throw new BadRequestException('Customer not found in this workspace');
  }
}