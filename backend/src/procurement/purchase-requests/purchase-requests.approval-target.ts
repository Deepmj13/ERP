import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { ApprovalsService } from '../../ops/approvals/approvals.service';
import { PurchaseRequestsService } from './purchase-requests.service';

/**
 * Registers PURCHASE_REQUEST as an approval target. Approve runs the doc's own
 * state machine; reject is record-only (the model has no reject transition).
 */
@Injectable()
export class PurchaseRequestsApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: PurchaseRequestsService,
    private readonly approvals: ApprovalsService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'PURCHASE_REQUEST';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.approvals.recordDecision(user, 'PURCHASE_REQUEST', objectId, undefined, 'REJECTED');
  }
}