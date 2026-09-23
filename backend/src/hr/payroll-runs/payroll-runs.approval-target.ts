import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { ApprovalsService } from '../../ops/approvals/approvals.service';
import { PayrollRunsService } from './payroll-runs.service';

/**
 * Registers PAYROLL_RUN as an approval target. Approve runs the run's own
 * state machine; reject is record-only (payroll has no reject transition).
 */
@Injectable()
export class PayrollRunsApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: PayrollRunsService,
    private readonly approvals: ApprovalsService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'PAYROLL_RUN';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.approvals.recordDecision(user, 'PAYROLL_RUN', objectId, undefined, 'REJECTED');
  }
}