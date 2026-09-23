import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';

export interface CreateLeaveInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days?: number;
  reason?: string;
  mobileUuid?: string;
}

export interface CreateSelfLeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days?: number;
  reason?: string;
  mobileUuid?: string;
}

const computeDays = (startDate: Date, endDate: Date, days?: number): number => {
  if (days !== undefined && days > 0) return days;
  const span = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  return span > 0 ? span : 1;
};

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
  ) {}

  private async resolveEmployee(user: AuthUser, employeeId?: string) {
    let id = employeeId;
    if (!id) {
      const linked = await this.prisma.employee.findFirst({
        where: { tenantId: user.tenantId, userId: user.userId },
        select: { id: true },
      });
      if (!linked) throw new NotFoundException('No employee linked to this user');
      id = linked.id;
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');
    return employee.id;
  }

  async list(user: AuthUser, q?: string, status?: string, employeeId?: string) {
    return this.prisma.leave.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { reason: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(status ? { status } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listMine(user: AuthUser) {
    const employeeId = await this.resolveEmployee(user);
    return this.prisma.leave.findMany({
      where: { tenantId: user.tenantId, employeeId },
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const leave = await this.prisma.leave.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true } },
      },
    });
    if (!leave) throw new NotFoundException('Leave request not found in this workspace');
    return leave;
  }

  async create(user: AuthUser, input: CreateLeaveInput, status = 'DRAFT') {
    const leave = await this.createDoc(user, input.employeeId, input, status);
    return this.get(user, leave.id);
  }

  async createMine(user: AuthUser, input: CreateSelfLeaveInput) {
    const employeeId = await this.resolveEmployee(user);
    const leave = await this.createDoc(user, employeeId, input, 'PENDING');
    await this.approvals.recordSubmit(user, 'LEAVE', leave.id);
    return this.get(user, leave.id);
  }

  private async createDoc(
    user: AuthUser,
    employeeId: string,
    input: { leaveTypeId: string; startDate: string; endDate: string; days?: number; reason?: string; mobileUuid?: string },
    status: string,
  ) {
    if (!input.leaveTypeId) throw new BadRequestException('Leave type is required');
    if (!input.startDate || !input.endDate) throw new BadRequestException('Start and end dates are required');

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: input.leaveTypeId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found in this workspace');

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('End date cannot be before start date');
    }
    const days = computeDays(startDate, endDate, input.days);

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.leave.create({
        data: {
          tenantId: user.tenantId,
          employeeId,
          leaveTypeId: input.leaveTypeId,
          startDate,
          endDate,
          days,
          reason: input.reason,
          status,
          mobileUuid: input.mobileUuid,
        },
      });
    });
  }

  async submit(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'DRAFT', 'PENDING');
    await this.approvals.recordSubmit(user, 'LEAVE', id);
    return doc;
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.get(user, id);
    if (!['DRAFT', 'PENDING'].includes(doc.status)) {
      throw new BadRequestException(`Cannot cancel leave request in status ${doc.status}`);
    }
    const updated = await this.prisma.leave.update({ where: { id }, data: { status: 'CANCELLED' } });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'leave.cancel',
      entityType: 'leave',
      entityId: id,
      newValues: { status: 'CANCELLED' },
    });
    return updated;
  }

  async approve(user: AuthUser, id: string) {
    await this.decide(user, id, 'APPROVED');
    await this.approvals.recordDecision(user, 'LEAVE', id, undefined, 'APPROVED');
    return this.get(user, id);
  }

  async reject(user: AuthUser, id: string) {
    await this.decide(user, id, 'REJECTED');
    await this.approvals.recordDecision(user, 'LEAVE', id, undefined, 'REJECTED');
    return this.get(user, id);
  }

  private async decide(user: AuthUser, id: string, to: 'APPROVED' | 'REJECTED') {
    const doc = await this.prisma.leave.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Leave request not found in this workspace');
    if (doc.status !== 'PENDING') {
      throw new BadRequestException(`Invalid transition: ${doc.status} → ${to}`);
    }

    const updated = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.leave.update({
        where: { id },
        data: { status: to, approvedById: user.userId, approvedAt: new Date() },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: `leave.${to.toLowerCase()}`,
      entityType: 'leave',
      entityId: id,
      newValues: { status: to },
    });
    return updated;
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    const doc = await this.prisma.leave.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Leave request not found in this workspace');
    if (doc.status !== from) {
      throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
    }
    return this.prisma.leave.update({ where: { id }, data: { status: to } });
  }
}