import PDFDocument from 'pdfkit';

import { PdfRenderer } from './pdf-renderer.interface';
import type { PlaceholderPdfContext } from './default-pdf-renderer';
import { PrismaClient } from '../../database';

/** Persisted `earnings` JSON shape written by PayrollRunsService.calculate(). */
interface EarningsShape {
  basicSalary?: number | string;
  allowances?: Record<string, unknown>;
  totalAllowances?: number | string;
}

/** Persisted `deductions` JSON shape written by PayrollRunsService.calculate(). */
interface DeductionsShape {
  deductions?: Record<string, unknown>;
  total?: number | string;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('amount' in obj) return asNumber(obj.amount);
  }
  return 0;
}

/**
 * Phase 7b payslip renderer: loads the payslip + employee + salary structure
 * through the RLS-armed `tx`, then emits a tabular A4 payslip (earnings,
 * deductions, net pay) as a PDF buffer. The payslip row's persisted JSON is the
 * source of truth for amounts; the structure only contributes display notes.
 */
export class PayslipPdfRenderer implements PdfRenderer {
  constructor(private readonly context: PlaceholderPdfContext) {}

  async render(tx: PrismaClient, tenantId: string, documentId: string): Promise<Buffer> {
    const payslip = await tx.payslip.findFirst({
      where: { id: documentId, tenantId },
      include: {
        employee: { select: { employeeNo: true, firstName: true, lastName: true } },
        payrollRun: { select: { number: true, periodStart: true, periodEnd: true } },
      },
    });
    if (!payslip) throw new Error(`Payslip ${documentId} not found for rendering`);

    const earnings = (payslip.earnings as unknown as EarningsShape | null) ?? {};
    const deductionsStore = (payslip.deductions as unknown as DeductionsShape | null) ?? {};

    const structure = await tx.salaryStructure.findFirst({
      where: { tenantId, employeeId: payslip.employeeId, isActive: true },
      orderBy: { effectiveDate: 'desc' },
    });
    const currency = structure?.currency ?? 'USD';
    const allowances = earnings.allowances ?? {};
    const deductions = deductionsStore.deductions ?? {};

    return renderPayslip(this.context, {
      employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
      employeeNo: payslip.employee.employeeNo,
      runNumber: payslip.payrollRun.number,
      periodStart: payslip.payrollRun.periodStart,
      periodEnd: payslip.payrollRun.periodEnd,
      currency,
      basicSalary: asNumber(earnings.basicSalary ?? structure?.basicSalary),
      allowances,
      totalAllowances: asNumber(earnings.totalAllowances ?? 0),
      deductions,
      totalDeductions: asNumber(deductionsStore.total ?? payslip.totalDeductions),
      netPay: asNumber(payslip.netPay),
      notes: structure?.payStructureNotes ?? undefined,
    });
  }
}

interface PayslipLayout {
  employeeName: string;
  employeeNo: string;
  runNumber: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  basicSalary: number;
  allowances: Record<string, unknown>;
  totalAllowances: number;
  deductions: Record<string, unknown>;
  totalDeductions: number;
  netPay: number;
  notes?: string;
}

const A4_WIDTH = 595.28;
const MARGIN = 48;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const LABEL_WIDTH = CONTENT_WIDTH - 110;

export function renderPayslip(ctx: PlaceholderPdfContext, layout: PayslipLayout): Promise<Buffer> {
  const fmt = (n: number): string => `${layout.currency} ${n.toFixed(2)}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Payslip ${layout.runNumber} — ${layout.employeeName}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header band
    doc.font('Helvetica-Bold').fontSize(20).text('PAYSLIP', { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).text(`Payroll run ${layout.runNumber}`, { align: 'center' });
    doc
      .fontSize(9)
      .text(
        `Period: ${layout.periodStart.toISOString().slice(0, 10)} — ${layout.periodEnd.toISOString().slice(0, 10)}`,
        { align: 'center' },
      );
    doc.moveDown(1);

    // Employee block
    doc.font('Helvetica-Bold').fontSize(11).text('Employee');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Name: ${layout.employeeName}`);
    doc.text(`Employee No: ${layout.employeeNo}`);
    doc.moveDown(0.8);

    const startRow = (title: string) => {
      doc.font('Helvetica-Bold').fontSize(11).text(title);
      doc.moveDown(0.2);
    };
    const addRow = (label: string, amount: number, boldAsTotal = false) => {
      const y = doc.y;
      if (boldAsTotal) {
        doc.font('Helvetica-Bold').fontSize(10).text(label, MARGIN, y);
      } else {
        doc.font('Helvetica').fontSize(10).text(label, MARGIN, y);
      }
      const amountText = fmt(amount);
      const width = doc.widthOfString(amountText);
      if (boldAsTotal) {
        doc.font('Helvetica-Bold').fontSize(10).text(amountText, A4_WIDTH - MARGIN - width, y);
      } else {
        doc.font('Helvetica').fontSize(10).text(amountText, A4_WIDTH - MARGIN - width, y);
      }
      doc.moveDown(0.3);
    };

    // Earnings
    startRow('Earnings');
    addRow('Basic salary', layout.basicSalary);
    for (const [name, value] of Object.entries(layout.allowances)) {
      addRow(`Allowance: ${name}`, asNumber(value));
    }
    addRow('Total earnings', layout.basicSalary + layout.totalAllowances, true);
    doc.moveDown(0.5);

    // Deductions
    startRow('Deductions');
    if (Object.keys(layout.deductions).length === 0) {
      addRow('None', 0);
    }
    for (const [name, value] of Object.entries(layout.deductions)) {
      addRow(`Deduction: ${name}`, asNumber(value));
    }
    addRow('Total deductions', layout.totalDeductions, true);
    doc.moveDown(0.8);

    // Net pay
    const net = layout.basicSalary + layout.totalAllowances - layout.totalDeductions;
    doc.moveDown(0.5);
    addRow('NET PAY', net >= 0 ? net : 0);
    doc.moveDown(0.5);

    if (layout.notes) {
      doc.font('Helvetica-Oblique').fontSize(9).text(`Notes: ${layout.notes}`);
      doc.moveDown(0.5);
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#666666')
      .text(
        `Generated ${new Date().toISOString()}${ctx.generatedById ? ` by user ${ctx.generatedById}` : ''}`,
        { align: 'center' },
      );

    doc.end();
  });
}