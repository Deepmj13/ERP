import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateSalaryStructureInput {
  employeeId: string;
  effectiveDate: string;
  currency?: string;
  basicSalary: number;
  allowances?: Record<string, unknown>;
  deductions?: Record<string, unknown>;
  payStructureNotes?: string;
  isActive?: boolean;
}

export interface UpdateSalaryStructureInput {
  basicSalary?: number;
  allowances?: Record<string, unknown>;
  deductions?: Record<string, unknown>;
  payStructureNotes?: string;
  isActive?: boolean;
}

@Injectable()
export class SalaryStructuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly include = {
    employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
  } as const;

  async list(user: AuthUser, employeeId?: string, q?: string) {
    return this.prisma.salaryStructure.findMany({
      where: {
        tenantId: user.tenantId,
        ...(employeeId ? { employeeId } : {}),
        ...(q
          ? {
              employee: {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' as const } },
                  { lastName: { contains: q, mode: 'insensitive' as const } },
                  { employeeNo: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            }
          : {}),
      },
      include: this.include,
      orderBy: [{ effectiveDate: 'desc' }],
    });
  }

  async get(user: AuthUser, id: string) {
    const structure = await this.prisma.salaryStructure.findFirst({
      where: { id, tenantId: user.tenantId },
      include: this.include,
    });
    if (!structure) throw new NotFoundException('Salary structure not found in this workspace');
    return structure;
  }

  async create(user: AuthUser, input: CreateSalaryStructureInput) {
    if (input.basicSalary === undefined || input.basicSalary < 0) {
      throw new BadRequestException('Basic salary must be a non-negative amount');
    }
    if (!input.effectiveDate) throw new BadRequestException('Effective date is required');

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in this workspace');

    const effectiveDate = new Date(input.effectiveDate);
    const duplicate = await this.prisma.salaryStructure.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeId: input.employeeId,
        effectiveDate,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        'A salary structure for this employee already exists on the same effective date',
      );
    }

    const currency = input.currency || 'USD';
    const structure = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.salaryStructure.create({
        data: {
          tenantId: user.tenantId,
          employeeId: input.employeeId,
          effectiveDate,
          currency,
          basicSalary: new Prisma.Decimal(input.basicSalary),
          allowances: (input.allowances as never) ?? {},
          deductions: (input.deductions as never) ?? {},
          payStructureNotes: input.payStructureNotes,
          isActive: input.isActive ?? true,
        },
        include: this.include,
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'salary_structure.create',
      entityType: 'salary_structure',
      entityId: structure.id,
      newValues: input,
    });
    return structure;
  }

  async update(user: AuthUser, id: string, input: UpdateSalaryStructureInput) {
    const existing = await this.prisma.salaryStructure.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) throw new NotFoundException('Salary structure not found in this workspace');

    const updated = await this.prisma.salaryStructure.update({
      where: { id },
      data: {
        basicSalary:
          input.basicSalary !== undefined ? new Prisma.Decimal(input.basicSalary) : undefined,
        allowances: input.allowances !== undefined ? (input.allowances as never) : undefined,
        deductions: input.deductions !== undefined ? (input.deductions as never) : undefined,
        payStructureNotes: input.payStructureNotes,
        isActive: input.isActive,
      },
      include: this.include,
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'salary_structure.update',
      entityType: 'salary_structure',
      entityId: id,
      oldValues: existing,
      newValues: input,
    });
    return updated;
  }
}