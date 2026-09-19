import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';
import { StorageService } from '@erp/storage';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { DocumentsJobService } from '../../jobs/documents.job.service';

export interface PayslipPdfOutput {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsJob: DocumentsJobService,
    private readonly storage: StorageService,
  ) {}

  private readonly includeEmployee = {
    employee: { select: { id: true, employeeNo: true, firstName: true, lastName: true } },
  } as const;

  async list(user: AuthUser, payrollRunId?: string, employeeId?: string) {
    const where: Prisma.PayslipWhereInput = {
      tenantId: user.tenantId,
      ...(payrollRunId ? { payrollRunId } : {}),
      ...(employeeId ? { employeeId } : {}),
    };
    const payslips = await this.prisma.payslip.findMany({
      where,
      include: {
        ...this.includeEmployee,
        payrollRun: { select: { id: true, number: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const documentIds = payslips.map((p) => p.id);
    const documents =
      documentIds.length === 0
        ? []
        : await this.prisma.documentFile.findMany({
            where: {
              tenantId: user.tenantId,
              documentType: 'PAYSLIP',
              documentId: { in: documentIds },
              status: 'GENERATED',
            },
            orderBy: [{ documentId: 'asc' }, { version: 'desc' }],
            take: documentIds.length * 10,
          });
    const latestByPayslip = new Map<string, (typeof documents)[number]>();
    for (const doc of documents) {
      if (!latestByPayslip.has(doc.documentId)) latestByPayslip.set(doc.documentId, doc);
    }

    return payslips.map((payslip) => ({
      ...payslip,
      pdf: latestByPayslip.get(payslip.id) ?? null,
    }));
  }

  /** Queues PDF generation for a payslip (hr.payslip.generate). */
  async queuePdf(user: AuthUser, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { payrollRun: { select: { number: true, periodStart: true, periodEnd: true } } },
    });
    if (!payslip) throw new NotFoundException('Payslip not found in this workspace');

    await this.documentsJob.queuePdf({
      tenantId: user.tenantId,
      documentType: 'PAYSLIP',
      template: 'payslip',
      documentId: id,
      generatedById: user.userId,
      meta: {
        payslipId: id,
        runNumber: payslip.payrollRun.number,
        periodStart: payslip.payrollRun.periodStart,
        periodEnd: payslip.payrollRun.periodEnd,
      },
    });
    return { job: 'queued', id };
  }

  /** Streams the latest generated PDF for a payslip. */
  async download(user: AuthUser, id: string): Promise<PayslipPdfOutput> {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { payrollRun: { select: { number: true } }, employee: { select: { employeeNo: true } } },
    });
    if (!payslip) throw new NotFoundException('Payslip not found in this workspace');

    const document = await this.prisma.documentFile.findFirst({
      where: {
        tenantId: user.tenantId,
        documentType: 'PAYSLIP',
        documentId: id,
        status: 'GENERATED',
      },
      orderBy: { version: 'desc' },
    });
    if (!document) {
      throw new BadRequestException('No generated PDF available yet — queue generation first');
    }
    if (!document.storageKey) {
      throw new BadRequestException('Payslip PDF has no storage key');
    }

    const file = await this.storage.read(document.storageKey);
    if (!file) {
      throw new NotFoundException('Payslip PDF bytes not found in storage');
    }
    return {
      buffer: file.body,
      fileName: `payslip-${payslip.payrollRun.number}-${payslip.employee.employeeNo}.pdf`,
      contentType: 'application/pdf',
    };
  }
}