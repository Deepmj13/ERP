import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { SaasAssertionsService } from '../saas-assertions.service';

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saas: SaasAssertionsService,
  ) {}

  /** Plan limits (with tenant-level overrides applied) plus live counts. */
  async limits(user: AuthUser) {
    const sub = await this.saas.currentSubscription(user);

    const [users, documents] = await Promise.all([
      this.prisma.tenantUser.count({ where: { tenantId: user.tenantId, status: 'ACTIVE' } }),
      this.prisma.documentFile.count({ where: { tenantId: user.tenantId } }),
    ]);

    const metrics = ['users', 'documents', 'storage_mb', 'api_calls'];
    const resolved: Record<string, number | null> = {};
    for (const m of metrics) resolved[m] = await this.saas.resolveLimit(user, m);

    return {
      plan: sub.plan,
      limits: resolved,
      current: { users, documents },
    };
  }

  /** Latest recorded usage readings (written by the usage-meter worker tap). */
  async current(user: AuthUser) {
    const rows = await this.prisma.withTenant(user.tenantId, (tx) =>
      tx.usageMetric.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { recordedAt: 'desc' },
        take: 40,
      }),
    );
    return rows.map((r) => ({
      metric: r.metric,
      value: Number(r.value),
      recordedAt: r.recordedAt,
    }));
  }
}