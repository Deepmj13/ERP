import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { QuotationsService } from './quotations.service';

/** Registers QUOTATION as an approval target so inbox actions use the state machine. */
@Injectable()
export class QuotationsApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: QuotationsService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'QUOTATION';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.reject(user, objectId);
  }
}