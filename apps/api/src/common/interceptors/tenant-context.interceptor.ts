import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { RlsContext } from '../rls/rls-context';
import { AuthUser } from '../../auth/auth.types';

/**
 * Arms the row-level-security tenant context for the duration of an
 * authenticated request (ADR-0002). Runs outermost (registered before
 * IdempotencyInterceptor) so every downstream DB access — including the
 * idempotency claim/settle — executes with `app.current_tenant_id` set.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return RlsContext.run(request.user?.tenantId, () => next.handle());
  }
}
