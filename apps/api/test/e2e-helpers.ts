import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Shared e2e bootstrap (G-7 / plan §25). Mirrors `main.ts` minus transport
 * concerns (helmet, swagger, cors) — same global prefix, URI versioning,
 * validation pipe and the production error envelope, so the specs exercise
 * the real request path.
 */
export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('/api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export const api = (app: INestApplication) => request(app.getHttpServer());

/** Registered tenant + owner session from POST /api/v1/auth/register. */
export interface RegisteredTenant {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  email: string;
  password: string;
  user: { id: string; email: string; name: string };
}

export async function registerTenant(
  app: INestApplication,
  password = 'e2e!Password1',
): Promise<RegisteredTenant> {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e.${suffix}@test.local`;
  const body = {
    tenantName: `E2E ${suffix}`,
    name: 'E2E Owner',
    email,
    password,
  };
  const res = await api(app).post('/api/v1/auth/register').send(body).expect(201);
  const ctx = res.body.data;
  expect(ctx.accessToken).toEqual(expect.any(String));
  expect(ctx.tenant.id).toEqual(expect.any(String));
  return {
    accessToken: ctx.accessToken,
    refreshToken: ctx.refreshToken,
    tenantId: ctx.tenant.id,
    email,
    password,
    user: ctx.user,
  };
}

export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

/**
 * Tears the app down cleanly. BullMQ queue connections are closed first with a
 * bounded wait so an unreachable Redis never hangs the run, then the Nest app
 * itself is closed.
 */
export async function closeTestApp(app: INestApplication): Promise<void> {
  const closeQueue = async (name: string): Promise<void> => {
    let queue: Queue | undefined;
    try {
      queue = app.get<Queue>(getQueueToken(name));
    } catch {
      return;
    }
    if (!queue) return;
    await Promise.race([
      queue.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  };
  await closeQueue('pdf');
  await closeQueue('email');
  await app.close();
}

/**
 * Best-effort cleanup: deletes the rows created by a registered tenant plus
 * owner. Guarded by `E2E_SKIP_CLEANUP=1` for debugging against a live Neon
 * database. Deletion order honours FK constraints (children before parents).
 */
export async function cleanupTenant(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<void> {
  if (process.env.E2E_SKIP_CLEANUP === '1') return;
  const steps = [
    () => prisma.session.deleteMany({ where: { userId } }),
    () => prisma.auditLog.deleteMany({ where: { tenantId } }),
    () => prisma.paymentAllocation.deleteMany({ where: { tenantId } }),
    () => prisma.payment.deleteMany({ where: { tenantId } }),
    () => prisma.invoiceItem.deleteMany({ where: { tenantId } }),
    () => prisma.invoice.deleteMany({ where: { tenantId } }),
    () => prisma.deliveryItem.deleteMany({ where: { tenantId } }),
    () => prisma.delivery.deleteMany({ where: { tenantId } }),
    () => prisma.salesOrderItem.deleteMany({ where: { tenantId } }),
    () => prisma.salesOrder.deleteMany({ where: { tenantId } }),
    () => prisma.quotationItem.deleteMany({ where: { tenantId } }),
    () => prisma.quotation.deleteMany({ where: { tenantId } }),
    () => prisma.stockMovement.deleteMany({ where: { tenantId } }),
    () => prisma.stockBalance.deleteMany({ where: { tenantId } }),
    () => prisma.serialNumber.deleteMany({ where: { tenantId } }),
    () => prisma.batch.deleteMany({ where: { tenantId } }),
    () => prisma.journalEntryLine.deleteMany({ where: { tenantId } }),
    () => prisma.bankTransaction.deleteMany({ where: { tenantId } }),
    () => prisma.journalEntry.deleteMany({ where: { tenantId } }),
    () => prisma.bankAccount.deleteMany({ where: { tenantId } }),
    () => prisma.warehouse.deleteMany({ where: { tenantId } }),
    () => prisma.account.deleteMany({ where: { tenantId } }),
    () => prisma.fiscalPeriod.deleteMany({ where: { tenantId } }),
    () => prisma.accountGroup.deleteMany({ where: { tenantId } }),
    () => prisma.documentFile.deleteMany({ where: { tenantId } }),
    () => prisma.documentSequence.deleteMany({ where: { tenantId } }),
    () => prisma.idempotencyKey.deleteMany({ where: { tenantId } }),
    () => prisma.customerContact.deleteMany({ where: { tenantId } }),
    () => prisma.customer.deleteMany({ where: { tenantId } }),
    () => prisma.product.deleteMany({ where: { tenantId } }),
    () => prisma.taxRate.deleteMany({ where: { tenantId } }),
    () => prisma.productCategory.deleteMany({ where: { tenantId } }),
    () => prisma.unit.deleteMany({ where: { tenantId } }),
    () => prisma.branch.deleteMany({ where: { tenantId } }),
    () => prisma.rolePermission.deleteMany({ where: { tenantId } }),
    () => prisma.userRole.deleteMany({ where: { userId } }),
    () => prisma.tenantUser.deleteMany({ where: { userId } }),
    () => prisma.role.deleteMany({ where: { tenantId } }),
    () => prisma.user.delete({ where: { id: userId } }),
    () => prisma.company.deleteMany({ where: { tenantId } }),
    () => prisma.tenant.delete({ where: { id: tenantId } }),
  ];
  for (const step of steps) {
    const label = step.toString().slice(0, 90);
    try {
      await Promise.race([
        step().catch((err: unknown) => {
          // P2025 = record not found — expected when a table has no rows.
          if (!(err instanceof Error) || !err.message.includes('P2025')) throw err;
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`cleanup step timed out: ${label}`)), 20_000),
        ),
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`cleanup skipped for tenant ${tenantId}: ${(err as Error).message}`);
    }
  }
}
