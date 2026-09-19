import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { FinanceService } from '../../finance/finance.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';
import { NotificationsService } from '../../ops/notifications/notifications.service';
import { flatTotal, payrollRunNumber } from './payroll.utils';

export interface CreatePayrollRunInput {
  periodStart: string;
  periodEnd: string;
  notes?: string;
}

@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly finance: FinanceService,
    private readonly approvals: ApprovalsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, status?: string) {
    return this.prisma.payrollRun.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
      },
      include: { _count: { select: { payslips: true } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        payslips: {
          include: {
            employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found in this workspace');
    return run;
  }

  /** Creates a DRAFT run; the number is derived from the period start (PR-YYYY-MM). */
  async create(user: AuthUser, input: CreatePayrollRunInput) {
    if (!input.periodStart || !input.periodEnd) {
      throw new BadRequestException('Period start and end are required');
    }
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);
    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new BadRequestException('Period end must be after period start');
    }
    const number = payrollRunNumber(periodStart);

    const run = await this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.payrollRun.findFirst({ where: { tenantId: user.tenantId, number } });
      if (existing) {
        throw new BadRequestException(`A payroll run for ${number} already exists`);
      }
      return tx.payrollRun.create({
        data: {
          tenantId: user.tenantId,
          number,
          periodStart,
          periodEnd,
          status: 'DRAFT',
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'payroll_run.create',
      entityType: 'payroll_run',
      entityId: run.id,
      newValues: { number, periodStart: input.periodStart, periodEnd: input.periodEnd },
    });
    return this.get(user, run.id);
  }

  /**
   * Clears and recomputes the run's draft payslips from the active salary
   * structure of every active employee (latest effective date ≤ period start).
   * Never posts — totals land on the run for review.
   */
  async calculate(user: AuthUser, id: string) {
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!run) throw new NotFoundException('Payroll run not found in this workspace');
      if (run.status !== 'DRAFT') {
        throw new BadRequestException(`Payroll calculation requires a DRAFT run (got ${run.status})`);
      }

      await tx.payslip.deleteMany({ where: { payrollRunId: id } });

      const structures = await tx.salaryStructure.findMany({
        where: { tenantId: user.tenantId, isActive: true, effectiveDate: { lte: run.periodStart } },
        orderBy: [{ employeeId: 'asc' }, { effectiveDate: 'desc' }],
      });
      const latestByEmployee = new Map<string, (typeof structures)[number]>();
      for (const structure of structures) {
        if (!latestByEmployee.has(structure.employeeId)) latestByEmployee.set(structure.employeeId, structure);
      }

      const employees = await tx.employee.findMany({
        where: { tenantId: user.tenantId, status: 'ACTIVE' },
        select: { id: true },
      });

      const employeeIds = new Set(employees.map((e) => e.id));
      let totalGross = new Prisma.Decimal(0);
      let totalDeductions = new Prisma.Decimal(0);

      for (const [employeeId, structure] of latestByEmployee) {
        if (!employeeIds.has(employeeId)) continue;
        const allowances = (structure.allowances as Record<string, unknown>) ?? {};
        const deductions = (structure.deductions as Record<string, unknown>) ?? {};
        const totalAllowances = flatTotal(allowances);
        const totalDeductionsValue = flatTotal(deductions);
        const basic = new Prisma.Decimal(structure.basicSalary);
        const gross = basic.add(totalAllowances);
        const deductionsTotal = new Prisma.Decimal(totalDeductionsValue);
        const net = gross.sub(deductionsTotal).lt(0) ? new Prisma.Decimal(0) : gross.sub(deductionsTotal);

        totalGross = totalGross.add(gross);
        totalDeductions = totalDeductions.add(deductionsTotal);

        await tx.payslip.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: id,
            employeeId,
            grossPay: gross,
            totalDeductions: deductionsTotal,
            netPay: net,
            earnings: {
              basicSalary: structure.basicSalary.toNumber(),
              allowances,
              totalAllowances,
            } as never,
            deductions: {
              deductions,
              total: totalDeductionsValue,
            } as never,
          },
        });
      }

      await tx.payrollRun.update({
        where: { id },
        data: {
          totalGross,
          totalDeductions,
          totalNet: totalGross.sub(totalDeductions),
        },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'payroll_run.calculate',
      entityType: 'payroll_run',
      entityId: id,
      newValues: {},
    });
    return this.get(user, id);
  }

  async approve(user: AuthUser, id: string) {
    let runNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!run) throw new NotFoundException('Payroll run not found in this workspace');
      if (run.status !== 'DRAFT') {
        throw new BadRequestException(`Invalid transition: ${run.status} → APPROVED`);
      }
      const payslipCount = await tx.payslip.count({ where: { payrollRunId: id } });
      if (payslipCount === 0) {
        throw new BadRequestException('Calculate the run before approving it');
      }
      runNumber = run.number;
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'APPROVED', approvedById: user.userId, approvedAt: new Date() },
      });
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'payroll_run.approve',
      entityType: 'payroll_run',
      entityId: id,
      newValues: { status: 'APPROVED' },
    });
    await this.approvals.recordDecision(user, 'PAYROLL_RUN', id, runNumber, 'APPROVED');
    return this.get(user, id);
  }

  /** Posts the run (APPROVED → POSTED) and journals the salary entry in the same tx. */
  async post(user: AuthUser, id: string) {
    let runNumber: string | undefined;
    let approverId: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!run) throw new NotFoundException('Payroll run not found in this workspace');
      if (run.status !== 'APPROVED') {
        throw new BadRequestException(`Invalid transition: ${run.status} → POSTED`);
      }
      runNumber = run.number;
      approverId = run.approvedById ?? undefined;
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'POSTED', postedById: user.userId, postedAt: new Date() },
      });
      await this.finance.postPayrollRun(tx, user.tenantId, id, user.userId);
    });

    if (approverId && approverId !== user.userId) {
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: approverId,
        type: 'payroll.posted',
        title: `Payroll run ${runNumber ?? ''} posted`,
        body: 'The payroll run was posted to the general ledger.',
        data: { payrollRunId: id, number: runNumber },
      });
    }

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'payroll_run.post',
      entityType: 'payroll_run',
      entityId: id,
      newValues: { status: 'POSTED' },
    });
    return this.get(user, id);
  }

  /**
   * Reverses a posted run: swaps the source PAYROLL entry's lines into a new
   * posted reversal (linked via reversedById), marks the source entry REVERSED,
   * and flips the run to REVERSED. Mirrors journal.service reverse semantics.
   */
  async reverse(user: AuthUser, id: string) {
    let reverseId: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!run) throw new NotFoundException('Payroll run not found in this workspace');
      if (run.status !== 'POSTED') {
        throw new BadRequestException(`Invalid transition: ${run.status} → REVERSED`);
      }

      const source = await tx.journalEntry.findFirst({
        where: { tenantId: user.tenantId, referenceType: 'PAYROLL', referenceId: id },
        include: { lines: true },
      });
      if (!source) {
        throw new BadRequestException('No posted journal entry found for this payroll run');
      }
      if (source.status !== 'POSTED') {
        throw new BadRequestException('The payroll journal entry is not POSTED and cannot be reversed');
      }
      if (!(await this.finance.isPeriodPostable(tx, user.tenantId, new Date()))) {
        throw new BadRequestException('Reversal target period is closed');
      }

      const number = await this.numbering.allocateNumber(
        user.tenantId,
        'JE',
        { prefix: 'JE-' },
        tx as never,
      );
      const reversed = await tx.journalEntry.create({
        data: {
          tenantId: user.tenantId,
          number: number.number,
          entryDate: new Date(),
          referenceType: 'PAYROLL',
          referenceId: id,
          description: `Reversal of ${source.number ?? source.id}`,
          totalDebit: source.totalCredit,
          totalCredit: source.totalDebit,
          status: 'POSTED',
          reversedById: source.id,
          createdById: user.userId,
          postedAt: new Date(),
          lines: {
            create: source.lines.map((line) => ({
              tenantId: user.tenantId,
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              narration: line.narration,
            })),
          },
        },
      });
      await tx.journalEntry.update({
        where: { id: source.id },
        data: { status: 'REVERSED' },
      });
      await tx.payrollRun.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedById: user.userId,
          reversedAt: new Date(),
        },
      });
      reverseId = reversed.id;
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'payroll_run.reverse',
      entityType: 'payroll_run',
      entityId: id,
      newValues: { status: 'REVERSED', reverseId },
    });
    return this.get(user, id);
  }
}