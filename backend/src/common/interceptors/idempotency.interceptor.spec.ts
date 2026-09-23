import { ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { of, lastValueFrom } from 'rxjs';
import { IdempotencyStatus } from '../../database';
import { IdempotencyInterceptor } from './idempotency.interceptor';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function makeCtx(request: Record<string, unknown>, response?: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response ?? {},
    }),
  } as any;
}

function makePrisma(overrides: Record<string, jest.Mock> = {}) {
  return {
    $queryRaw: jest.fn(),
    idempotencyKey: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as any;
}

function userReq(key?: string) {
  return {
    method: 'POST',
    path: '/v1/thing',
    headers: key ? { 'idempotency-key': key } : {},
    body: { name: 'x' },
    user: { userId: 'u1', tenantId: 't1' },
  };
}

describe('IdempotencyInterceptor (plan §16a)', () => {
  it('passes through without an idempotency key', async () => {
    const prisma = makePrisma();
    const interceptor = new IdempotencyInterceptor(prisma);
    const handle = jest.fn(() => of({ data: 'saved' }));

    const obs = await interceptor.intercept(makeCtx(userReq()), { handle } as any);
    await lastValueFrom(obs);

    expect(handle).toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('claims a fresh key and settles the result COMPLETE', async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { key: 'k1', request_hash: sha256({ name: 'x' }) },
    ]);
    const interceptor = new IdempotencyInterceptor(prisma);
    const response = { status: jest.fn() };

    const obs = await interceptor.intercept(makeCtx(userReq('k1'), response), {
      handle: () => of({ data: 'saved' }),
    } as any);
    await lastValueFrom(obs);

    expect(prisma.idempotencyKey.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: IdempotencyStatus.COMPLETE,
          responseCode: 200,
        }),
      }),
    );
  });

  it('replays a COMPLETE key with the stored response flagged replayed', async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
      status: 'COMPLETE',
      responseCode: 201,
      responseBody: { data: { id: 9 } },
      requestHash: sha256({ name: 'x' }),
    });
    const interceptor = new IdempotencyInterceptor(prisma);
    const response = { status: jest.fn() };

    const obs = await interceptor.intercept(makeCtx(userReq('k1'), response), {
      handle: () => of({ data: 'different' }),
    } as any);
    const out = await lastValueFrom(obs);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(out).toEqual({ data: { id: 9 }, meta: { replayed: true } });
    expect(prisma.idempotencyKey.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 while the same key is still PROCESSING', async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
      status: 'PROCESSING',
      requestHash: sha256({ name: 'x' }),
    });
    const interceptor = new IdempotencyInterceptor(prisma);

    await expect(
      interceptor.intercept(makeCtx(userReq('k1')), { handle: () => of(undefined) } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a COMPLETE key reused with a different request body', async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue({
      status: 'COMPLETE',
      responseCode: 200,
      responseBody: { data: { id: 9 } },
      requestHash: 'different-hash',
    });
    const interceptor = new IdempotencyInterceptor(prisma);

    await expect(
      interceptor.intercept(makeCtx(userReq('k1')), { handle: () => of(undefined) } as any),
    ).rejects.toThrow('Idempotency key reused with a different request body');
  });

  it('rejects a winning claim whose request hash differs from the current body', async () => {
    const prisma = makePrisma();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ key: 'k1', request_hash: 'other' }]);
    const interceptor = new IdempotencyInterceptor(prisma);

    await expect(
      interceptor.intercept(makeCtx(userReq('k1')), { handle: () => of(undefined) } as any),
    ).rejects.toThrow('Idempotency key reused with a different request body');
  });
});
