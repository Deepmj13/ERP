import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateAttendanceInput {
  employeeId: string;
  workDate: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  mobileUuid?: string;
}

export interface PunchInput {
  employeeId?: string;
  workDate: string;
  checkIn?: string;
  checkOut?: string;
}

const ATTENDANCE_STATUS = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'];

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string, from?: string, to?: string, status?: string) {
    const where = {
      tenantId: user.tenantId,
      ...(q ? { employee: { employeeNo: { contains: q, mode: 'insensitive' as const } } } : {}),
      ...(from ? { workDate: { gte: new Date(from) } } : {}),
      ...(to ? { workDate: { lte: new Date(to) } } : {}),
      ...(status ? { status } : {}),
    };

    const records = await this.prisma.attendance.findMany({
      where,
      include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } },
      orderBy: [{ workDate: 'desc' }, { employeeId: 'asc' }],
    });
    return records;
  }

  async get(user: AuthUser, id: string) {
    const record = await this.prisma.attendance.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } } },
    });
    if (!record) throw new NotFoundException('Attendance record not found in this workspace');
    return record;
  }

  private async resolveEmployee(user: AuthUser, employeeId?: string) {
    let id = employeeId;
    if (!id) {
      const linked = await this.prisma.employee.findFirst({
        where: { tenantId: user.tenantId, userId: user.userId },
        select: { id: true },
      });
      if (!linked) throw new BadRequestException('No employee linked to this user; provide employeeId');
      id = linked.id;
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');
    return employee.id;
  }

  async create(user: AuthUser, input: CreateAttendanceInput) {
    if (!input.workDate) throw new BadRequestException('Work date is required');
    const employeeId = await this.resolveEmployee(user, input.employeeId);

    const status = input.status && ATTENDANCE_STATUS.includes(input.status) ? input.status : 'PRESENT';
    const workDate = new Date(input.workDate);

    const record = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.attendance.create({
        data: {
          tenantId: user.tenantId,
          employeeId,
          workDate,
          checkIn: input.checkIn ? new Date(input.checkIn) : undefined,
          checkOut: input.checkOut ? new Date(input.checkOut) : undefined,
          status,
          mobileUuid: input.mobileUuid,
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'attendance.create',
      entityType: 'attendance',
      entityId: record.id,
      newValues: input,
    });
    return this.get(user, record.id);
  }

  /**
   * Punch (bulk clock-in/out) — upserts the (employee, workDate) row via an
   * idempotent write; omitted employeeId resolves to the caller's own employee.
   */
  async punch(user: AuthUser, input: PunchInput) {
    if (!input.workDate) throw new BadRequestException('Work date is required');
    const employeeId = await this.resolveEmployee(user, input.employeeId);
    const workDate = new Date(input.workDate);

    const record = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.attendance.findFirst({
        where: { tenantId: user.tenantId, employeeId, workDate },
      });

      const data = {
        tenantId: user.tenantId,
        employeeId,
        workDate,
        checkIn: input.checkIn ? new Date(input.checkIn) : (existing?.checkIn ?? new Date()),
        checkOut: input.checkOut ? new Date(input.checkOut) : existing?.checkOut,
        status: existing?.status ?? 'PRESENT',
      };

      if (existing) {
        return tx.attendance.update({ where: { id: existing.id }, data });
      }
      return tx.attendance.create({ data });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'attendance.punch',
      entityType: 'attendance',
      entityId: record.id,
      newValues: input,
    });
    return this.get(user, record.id);
  }
}