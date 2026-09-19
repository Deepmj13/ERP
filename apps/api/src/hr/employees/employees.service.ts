import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateEmployeeInput {
  employeeNo: string;
  firstName: string;
  lastName: string;
  departmentId?: string;
  userId?: string;
  jobTitle?: string;
  joinDate?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: Record<string, unknown>;
}

export interface UpdateEmployeeInput {
  employeeNo?: string;
  firstName?: string;
  lastName?: string;
  departmentId?: string;
  jobTitle?: string;
  joinDate?: string;
  status?: string;
  email?: string;
  phone?: string;
  address?: Record<string, unknown>;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string, departmentId?: string) {
    return this.prisma.employee.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { employeeNo: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
        ...(departmentId ? { departmentId } : {}),
      },
      include: { department: { select: { id: true, name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async get(user: AuthUser, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { department: { select: { id: true, name: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');
    return employee;
  }

  async create(user: AuthUser, input: CreateEmployeeInput) {
    if (!input.employeeNo?.trim()) throw new BadRequestException('Employee number is required');
    if (!input.firstName?.trim()) throw new BadRequestException('First name is required');
    if (!input.lastName?.trim()) throw new BadRequestException('Last name is required');

    if (input.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: input.departmentId, tenantId: user.tenantId },
      });
      if (!dept) throw new NotFoundException('Department not found in this workspace');
    }

    const status = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(input.status ?? 'ACTIVE')
      ? (input.status as string)
      : 'ACTIVE';

    const employee = await this.prisma.employee.create({
      data: {
        tenantId: user.tenantId,
        employeeNo: input.employeeNo.trim(),
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        departmentId: input.departmentId ?? undefined,
        userId: input.userId,
        jobTitle: input.jobTitle ?? undefined,
        joinDate: input.joinDate ? new Date(input.joinDate) : undefined,
        status,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        address: (input.address as never) ?? undefined,
      },
      include: { department: true },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'employee.create',
      entityType: 'employee',
      entityId: employee.id,
      newValues: input,
    });
    return employee;
  }

  async update(user: AuthUser, id: string, input: UpdateEmployeeInput) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');

    if (input.departmentId) {
      const dept = await this.prisma.department.findFirst({
        where: { id: input.departmentId, tenantId: user.tenantId },
      });
      if (!dept) throw new NotFoundException('Department not found in this workspace');
    }

    const status =
      input.status !== undefined
        ? ['ACTIVE', 'ON_LEAVE', 'TERMINATED'].includes(input.status)
          ? input.status
          : employee.status
        : undefined;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        employeeNo: input.employeeNo?.trim() || undefined,
        firstName: input.firstName?.trim() || undefined,
        lastName: input.lastName?.trim() || undefined,
        departmentId: input.departmentId,
        jobTitle: input.jobTitle ?? undefined,
        joinDate: input.joinDate ? new Date(input.joinDate) : undefined,
        status,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        address: (input.address as never) ?? undefined,
      },
      include: { department: true },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'employee.update',
      entityType: 'employee',
      entityId: id,
      oldValues: employee,
      newValues: input,
    });
    return updated;
  }
}