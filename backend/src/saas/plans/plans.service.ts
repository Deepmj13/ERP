import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** SubscriptionPlan is platform-level (RLS-exempt) — no tenant scope needed. */
  async list(interval?: string) {
    const rows = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true, ...(interval ? { interval } : {}) },
      orderBy: { price: 'asc' },
    });
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      interval: p.interval,
      price: Number(p.price),
      currency: p.currency,
      features: p.features,
      limits: p.limits,
    }));
  }
}