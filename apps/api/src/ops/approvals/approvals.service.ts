import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalTargetRegistry } from './approval-target.registry';

const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

const OBJECT_TYPE_LABELS: Record<string, string> = {
  QUOTATION: 'Quotation',
  SALES_ORDER: 'Sales Order',
  PURCHASE_REQUEST: 'Purchase Request',
  PURCHASE_ORDER: 'Purchase Order',
  LEAVE: 'Leave request',
  PAYROLL_RUN: 'Payroll run',
};

export interface ApprovalRequestInput {
  objectType: string;
  objectId: string;
  objectNumber?: string;
  approverId?: string;
}

/**
 * The approvals primitive (future.md §8). Records a submission as PENDING and
 * records the decision; inbox "act" actions route to the owning document's
 * state machine through the target registry. This is record-only — it never
 * changes whether the inherited state machine allows a transition.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ApprovalTargetRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  /** Records a submitted document as a PENDING approval request (idempotent per pending object). */
  request(user: AuthUser, input: ApprovalRequestInput): Promise<{ id: string }> {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.approvalRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          objectType: input.objectType,
          objectId: input.objectId,
          status: 'PENDING',
        },
      });
      if (existing) return { id: existing.id };

      const created = await tx.approvalRequest.create({
        data: {
          tenantId: user.tenantId,
          objectType: input.objectType,
          objectId: input.objectId,
          objectNumber: input.objectNumber,
          requestedById: user.userId,
          approverId: input.approverId ?? user.userId,
          status: 'PENDING',
        },
      });
      return { id: created.id };
    });
  }

  /**
   * Records a submit in the domain module's own transaction-free seam. Thin
   * wrapper over `request` so retrofit call sites read as one verb.
   */
  recordSubmit(
    user: AuthUser,
    objectType: string,
    objectId: string,
    objectNumber?: string,
  ): Promise<{ id: string }> {
    return this.request(user, { objectType, objectId, objectNumber });
  }

  /**
   * Records the decision on a PENDING request (or the approval history when
   * the document was approved directly, e.g. payroll), then notifies the
   * original requester unless they decided it themselves.
   */
  async recordDecision(
    user: AuthUser,
    objectType: string,
    objectId: string,
    objectNumber: string | undefined,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<void> {
    let requesterId: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const pending = await tx.approvalRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          objectType,
          objectId,
          status: 'PENDING',
        },
      });
      if (pending) {
        requesterId = pending.requestedById;
        await tx.approvalRequest.update({
          where: { id: pending.id },
          data: { status: decision, comment: comment ?? null, decidedAt: new Date() },
        });
        return;
      }
      const history = await tx.approvalRequest.findFirst({
        where: { tenantId: user.tenantId, objectType, objectId },
      });
      if (!history) {
        await tx.approvalRequest.create({
          data: {
            tenantId: user.tenantId,
            objectType,
            objectId,
            objectNumber,
            requestedById: user.userId,
            approverId: user.userId,
            status: decision,
            comment: comment ?? null,
            decidedAt: new Date(),
          },
        });
      }
    });

    if (requesterId && requesterId !== user.userId) {
      const label = OBJECT_TYPE_LABELS[objectType] ?? objectType;
      await this.notifications.notify({
        tenantId: user.tenantId,
        userId: requesterId,
        type: `approval.${decision.toLowerCase()}`,
        title: `${label} ${objectNumber ? `${objectNumber} ` : ''}${decision === 'APPROVED' ? 'approved' : 'rejected'}`,
        body: comment || `${label} has been ${decision === 'APPROVED' ? 'approved' : 'rejected'}.`,
        data: { objectType, objectId, objectNumber },
      });
    }
  }

  /** Idempotent: records the decision on any PENDING request for this object. */
  markDecided(
    user: AuthUser,
    objectType: string,
    objectId: string,
    status: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<unknown> {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.approvalRequest.updateMany({
        where: {
          tenantId: user.tenantId,
          objectType,
          objectId,
          status: 'PENDING',
        },
        data: { status, comment: comment ?? null, decidedAt: new Date() },
      });
    });
  }

  async list(
    user: AuthUser,
    scope: string,
    objectType?: string,
    status?: string,
  ): Promise<unknown[]> {
    return this.prisma.approvalRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(scope === 'requested' ? { requestedById: user.userId } : { approverId: user.userId }),
        ...(objectType ? { objectType } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!request) throw new NotFoundException('Approval request not found in this workspace');
    return request;
  }

  async countPendingFor(user: AuthUser): Promise<number> {
    return this.prisma.approvalRequest.count({
      where: { tenantId: user.tenantId, approverId: user.userId, status: 'PENDING' },
    });
  }

  /** Inbox action: approve/reject a PENDING request, routing to the owning module. */
  async act(
    user: AuthUser,
    id: string,
    action: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<unknown> {
    const request = await this.get(user, id);
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Approval request is already ${request.status}`);
    }

    const handler = this.registry.get(request.objectType);
    if (handler) {
      if (action === 'APPROVED') await handler.approve(user, request.objectId, comment);
      else await handler.reject(user, request.objectId, comment);
    }

    await this.markDecided(user, request.objectType, request.objectId, action, comment);
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: `approval.${action.toLowerCase()}`,
      entityType: 'approval_request',
      entityId: id,
      newValues: { objectType: request.objectType, objectId: request.objectId, comment },
    });
    return this.get(user, id);
  }

  /** Used by document modules to validate status values at the boundary. */
  assertStatus(status?: string) {
    if (status && !(APPROVAL_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid approval status: ${status}`);
    }
  }

  /** Reads a document's own number for the request record (string-cast safe). */
  asNumber(v: unknown): string | undefined {
    return v === null || v === undefined ? undefined : String(v);
  }

  /** Prisma typing helper: obj reader for the retrofits. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  objectNumber(tx: Prisma.TransactionClient, model: string, id: string): Promise<string | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (tx as any)[model];
    return delegate
      .findFirst({
        where: { id },
        select: { number: true },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((row: any) => (row?.number ? String(row.number) : null));
  }
}