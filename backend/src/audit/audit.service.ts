import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string;
}

/**
 * Centralized audit instrumentation (plan §21). Feature services call
 * `audit.log(...)`; entity/tenant ids always come from server-derived
 * context, never from request bodies.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry): Promise<unknown> {
    return this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValues: entry.oldValues as never,
        newValues: entry.newValues as never,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
