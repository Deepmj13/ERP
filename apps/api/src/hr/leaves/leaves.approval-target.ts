import { Injectable, OnModuleInit } from '@nestjs/common';

import { AuthUser } from '../../auth/auth.types';
import { ApprovalTargetHandler } from '../../ops/approvals/approval-target.interface';
import { ApprovalTargetRegistry } from '../../ops/approvals/approval-target.registry';
import { LeavesService } from './leaves.service';

/** Registers LEAVE as an approval target so inbox actions use the leave state machine. */
@Injectable()
export class LeavesApprovalTarget implements ApprovalTargetHandler, OnModuleInit {
  constructor(
    private readonly service: LeavesService,
    private readonly registry: ApprovalTargetRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  getObjectType(): string {
    return 'LEAVE';
  }

  approve(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.approve(user, objectId);
  }

  reject(user: AuthUser, objectId: string): Promise<unknown> {
    return this.service.reject(user, objectId);
  }
}