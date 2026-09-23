import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const;
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const TASK_TRANSITIONS: Record<string, string[]> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_REVIEW', 'DONE', 'CANCELLED'],
  IN_REVIEW: ['DONE', 'CANCELLED'],
  DONE: ['CANCELLED'],
  CANCELLED: ['TODO', 'IN_PROGRESS'],
};

export interface CreateTaskInput {
  projectId: string;
  assigneeId?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  mobileUuid?: string;
}

export interface UpdateTaskInput {
  projectId?: string;
  assigneeId?: string | null;
  title?: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    filters: { projectId?: string; assigneeId?: string; status?: string; priority?: string; q?: string },
  ) {
    return this.prisma.projectTask.findMany({
      where: {
        tenantId: user.tenantId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.q ? { title: { contains: filters.q, mode: 'insensitive' as const } } : {}),
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { project: { select: { id: true, name: true, code: true } } },
    });
    if (!task) throw new NotFoundException('Task not found in this workspace');
    return task;
  }

  async create(user: AuthUser, input: CreateTaskInput) {
    if (!input.title?.trim()) throw new BadRequestException('Task title is required');
    this.assertPriority(input.priority);

    const task = await this.prisma.withTenant(user.tenantId, async (tx) => {
      await this.assertProject(tx, user, input.projectId);
      return tx.projectTask.create({
        data: {
          tenantId: user.tenantId,
          projectId: input.projectId,
          assigneeId: input.assigneeId,
          title: input.title.trim(),
          description: input.description,
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          mobileUuid: input.mobileUuid,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'task.create',
      entityType: 'project_task',
      entityId: task.id,
      newValues: input,
    });
    return this.get(user, task.id);
  }

  async update(user: AuthUser, id: string, input: UpdateTaskInput) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!task) throw new NotFoundException('Task not found in this workspace');
    this.assertPriority(input.priority);

    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      if (input.projectId) await this.assertProject(tx, user, input.projectId);
      return tx.projectTask.update({
        where: { id },
        data: {
          projectId: input.projectId,
          assigneeId: input.assigneeId === null ? null : input.assigneeId,
          title: input.title?.trim(),
          description: input.description === null ? null : input.description,
          priority: input.priority,
          dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'task.update',
      entityType: 'project_task',
      entityId: id,
      oldValues: task,
      newValues: input,
    });
    return updated;
  }

  async setStatus(user: AuthUser, id: string, status: string) {
    if (!(TASK_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid task status: ${status}`);
    }
    const task = await this.prisma.projectTask.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!task) throw new NotFoundException('Task not found in this workspace');

    const allowed = TASK_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Invalid transition: ${task.status} → ${status}`);
    }

    const updated = await this.prisma.projectTask.update({ where: { id }, data: { status } });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'task.status',
      entityType: 'project_task',
      entityId: id,
      oldValues: { status: task.status },
      newValues: { status },
    });
    return updated;
  }

  private assertPriority(priority?: string) {
    if (priority && !(TASK_PRIORITIES as readonly string[]).includes(priority)) {
      throw new BadRequestException(`Invalid task priority: ${priority}`);
    }
  }

  private async assertProject(tx: Prisma.TransactionClient, user: AuthUser, projectId: string) {
    const project = await tx.project.findFirst({
      where: { id: projectId, tenantId: user.tenantId },
    });
    if (!project) throw new BadRequestException('Project not found in this workspace');
  }
}