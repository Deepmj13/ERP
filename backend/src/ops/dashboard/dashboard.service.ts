import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';

const DEFAULT_LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async kpis(user: AuthUser, from?: string, to?: string) {
    const range = this.range(from, to);
    const [revenue, invoiceTotal, collected, lowStockItems, pendingApprovals, openTasks, customers] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          _sum: { total: true },
          where: { tenantId: user.tenantId, status: 'POSTED', createdAt: range },
        }),
        this.prisma.invoice.aggregate({
          _sum: { total: true },
          where: { tenantId: user.tenantId, status: 'POSTED' },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { tenantId: user.tenantId, status: 'CAPTURED' },
        }),
        this.prisma.stockBalance.count({
          where: { tenantId: user.tenantId, quantity: { lte: DEFAULT_LOW_STOCK_THRESHOLD } },
        }),
        this.prisma.approvalRequest.count({
          where: { tenantId: user.tenantId, status: 'PENDING' },
        }),
        this.prisma.projectTask.count({
          where: { tenantId: user.tenantId, status: { notIn: ['DONE', 'CANCELLED'] } },
        }),
        this.prisma.customer.count({ where: { tenantId: user.tenantId } }),
      ]);

    const totalInvoiced = invoiceTotal._sum.total ?? new Prisma.Decimal(0);
    const collectedAmount = collected._sum.amount ?? new Prisma.Decimal(0);
    const outstanding = totalInvoiced.sub(collectedAmount);

    const pendingForMe = await this.prisma.approvalRequest.count({
      where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING' },
    });

    return {
      revenue: revenue._sum.total ?? new Prisma.Decimal(0),
      outstanding,
      totals: { invoiced: totalInvoiced, collected: collectedAmount },
      customers,
      lowStockItems,
      pendingApprovals,
      pendingForMe,
      openTasks,
      currency: 'USD',
    };
  }

  async salesTrend(user: AuthUser, from?: string, to?: string, interval = 'month') {
    const range = this.range(from, to);
    const bucket = this.intervalBucket(interval);
    return this.prisma.withTenant(user.tenantId, (tx) =>
      tx.$queryRaw<{ bucket: Date; count: number; revenue: number }[]>`
        SELECT date_trunc(${bucket}, created_at)::timestamp AS bucket,
               COUNT(*)::int AS count,
               CAST(COALESCE(SUM(total), 0) AS double precision) AS revenue
        FROM invoices
        WHERE tenant_id = ${user.tenantId}
          AND status = 'POSTED'
          AND created_at >= ${range.gte}
          AND created_at <= ${range.lte}
        GROUP BY bucket
        ORDER BY bucket ASC`,
    );
  }

  async approvalsPending(user: AuthUser): Promise<{ count: number; items: unknown[] }> {
    const [count, items] = await Promise.all([
      this.prisma.approvalRequest.count({
        where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING' },
      }),
      this.prisma.approvalRequest.findMany({
        where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    ]);
    return { count, items };
  }

  async tasksSummary(user: AuthUser) {
    const byStatus = await this.prisma.projectTask.groupBy({
      by: ['status'],
      where: { tenantId: user.tenantId },
      _count: { _all: true },
    });
    const now = new Date();
    const [overdue, myTasks] = await Promise.all([
      this.prisma.projectTask.count({
        where: {
          tenantId: user.tenantId,
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.projectTask.groupBy({
        by: ['status'],
        where: { tenantId: user.tenantId, assigneeId: user.userId },
        _count: { _all: true },
      }),
    ]);

    return {
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      myTasks: myTasks.map((row) => ({ status: row.status, count: row._count._all })),
      overdue,
    };
  }

  private range(from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 365 * 86_400_000);
    return { gte: fromDate, lte: toDate };
  }

  private intervalBucket(interval: string): Prisma.Sql {
    if (interval === 'day') return Prisma.sql`day`;
    if (interval === 'week') return Prisma.sql`week`;
    return Prisma.sql`month`;
  }
}