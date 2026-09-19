import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { ApprovalsService } from '../../ops/approvals/approvals.service';
import { PurchaseOrdersService } from './purchase-orders.service';

/**
 * Registers PURCHASE_ORDER as an approval target. Approve runs the doc's own
 * state machine; reject is record-only (the model has no reject transition).
 */
@Injectable()
export class PurchaseOrdersApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly approvals: ApprovalsService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'PURCHASE_ORDER';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.approvals.recordDecision(user, 'PURCHASE_ORDER', objectId, undefined, 'REJECTED');
  }
}