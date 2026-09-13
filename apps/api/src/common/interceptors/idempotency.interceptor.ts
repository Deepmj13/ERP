import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Observable, of, tap } from 'rxjs';
import { IdempotencyStatus } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';

interface ClaimRow {
  key: string;
  request_hash: string;
}

/**
 * Idempotency (plan §16a / ADR-0003).
 *
 * Mutating requests carrying an `Idempotency-Key` header:
 *  - First call claims the key atomically, stores the computed response.
 *  - A retry with the same key + endpoint + user returns the stored response
 *    and flags the envelope `meta.replayed = true`.
 *  - A replay still `processing` gets 409 (+ Retry-After) — the client retries
 *    with the same key instead of re-submitting.
 *  - The same key with a different request body is rejected.
 * Keys expire after 24h; the PG table remains the source of truth.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor<unknown, unknown> {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.headers['idempotency-key'];
    const method = request.method;

    if (!key || !['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || !request.user) {
      return next.handle();
    }

    const endpoint = `${method} ${request.path}`;
    const requestHash = sha256(request.body ?? {});
    const claims = await this.prisma.$queryRaw<ClaimRow[]>`
      INSERT INTO idempotency_keys (
        key, endpoint, user_id, tenant_id, request_hash, status, expires_at
      ) VALUES (
        ${key}, ${endpoint}, ${request.user.userId}, ${request.user.tenantId},
        ${requestHash}, ${IdempotencyStatus.PROCESSING}, NOW() + INTERVAL '24 hours'
      )
      ON CONFLICT (key, endpoint, user_id) DO NOTHING
      RETURNING key, request_hash
    `;

    const winner = claims[0];
    if (!winner) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key_endpoint_userId: { key: String(key), endpoint, userId: request.user.userId } },
      });
      if (!existing) return next.handle();

      if (existing.status === IdempotencyStatus.COMPLETE) {
        response.status(existing.responseCode ?? 200);
        const body = existing.responseBody as { data?: unknown; meta?: Record<string, unknown> };
        if (body && typeof body === 'object' && body.data) {
          return of({
            data: body.data,
            meta: { ...(body.meta ?? {}), replayed: true },
          });
        }
        return of({ data: body });
      }

      if (existing.status === IdempotencyStatus.PROCESSING) {
        throw new ConflictException('Request already in progress');
      }
      throw new ConflictException('Request previously failed — use a new idempotency key');
    }

    if (winner.request_hash !== requestHash) {
      throw new ConflictException('Idempotency key reused with a different request body');
    }

    return next.handle().pipe(
      tap(
        (value) => this.settle(String(key), endpoint, request.user!.userId, 200, value),
        (err: unknown) =>
          this.settle(
            String(key),
            endpoint,
            request.user!.userId,
            (err as { status?: number }).status ?? 500,
            err,
          ),
      ),
    );
  }

  private settle(
    key: string,
    endpoint: string,
    userId: string,
    code: number,
    value: unknown,
  ): void {
    const status =
      code >= 400 && code < 500 ? IdempotencyStatus.FAILED : IdempotencyStatus.COMPLETE;
    this.prisma.idempotencyKey
      .updateMany({
        where: { key, endpoint, userId, status: IdempotencyStatus.PROCESSING },
        data: { status, responseCode: code, responseBody: value as never },
      })
      .catch((e: unknown) => this.logger.error('Failed to settle idempotency claim', e));
  }
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
