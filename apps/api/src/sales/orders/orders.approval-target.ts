import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { ApprovalsService } from '../../ops/approvals/approvals.service';
import { OrdersService } from './orders.service';

/**
 * Registers SALES_ORDER as an approval target. Approve runs the document's own
 * state machine; reject is record-only — the order model has no unilateral
 * reject transition, so the decision is written to the approval history while
 * the document stays SUBMITTED (approved scope).
 */
@Injectable()
export class OrdersApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: OrdersService,
    private readonly approvals: ApprovalsService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'SALES_ORDER';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.approvals.recordDecision(user, 'SALES_ORDER', objectId, undefined, 'REJECTED');
  }
}