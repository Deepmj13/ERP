import { AuthUser } from '../../auth/auth.types';

/**
 * An approval-request target: a document type participating in the approvals
 * primitive. Modules register a handler (once, OnModuleInit) so the generic
 * inbox "approve/reject" actions route to the owning module's state machine
 * without a hard import dependency between OpsModule and the domain modules.
 */
export interface ApprovalTargetHandler {
  getObjectType(): string;
  approve(user: AuthUser, objectId: string, comment?: string): Promise<unknown>;
  reject(user: AuthUser, objectId: string, comment?: string): Promise<unknown>;
}