import { Injectable, Logger } from '@nestjs/common';

import { ApprovalTargetHandler } from './approval-target.interface';

/**
 * Registration point for approval-request targets. Each retrofitted module
 * registers itself on init; OpsModule never depends on a domain module.
 */
@Injectable()
export class ApprovalTargetRegistry {
  private readonly logger = new Logger(ApprovalTargetRegistry.name);
  private readonly handlers = new Map<string, ApprovalTargetHandler>();

  register(handler: ApprovalTargetHandler): void {
    const type = handler.getObjectType();
    this.handlers.set(type, handler);
    this.logger.debug(`registered approval target ${type}`);
  }

  get(objectType: string): ApprovalTargetHandler | undefined {
    return this.handlers.get(objectType);
  }

  objectTypes(): string[] {
    return [...this.handlers.keys()];
  }
}