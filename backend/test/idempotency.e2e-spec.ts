import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { randomUUID } from 'crypto';
import {
  createTestApp,
  api,
  registerTenant,
  authHeader,
  cleanupTenant,
  closeTestApp,
  RegisteredTenant,
} from './e2e-helpers';

/**
 * Idempotency (plan §16a / ADR-0003). A mutating request with an
 * `Idempotency-Key` is claimed atomically and stored; a retry with the same
 * key replays the stored response instead of re-executing — visible via
 * `meta.replayed`. Key reuse with a different body is a 409.
 */
describe('Idempotency (G-7 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: RegisteredTenant;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await registerTenant(app);
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenant.tenantId, tenant.user.id);
    await closeTestApp(app);
  });

  const key = (): string => randomUUID();
  const postCustomer = (idemKey: string, name: string) =>
    api(app)
      .post('/api/v1/customers')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', idemKey)
      .send({ name, email: `${name.toLowerCase().replace(/\s+/g, '')}@test.local` });

  it('replays the stored response for the same key + body (single row)', async () => {
    const idemKey = key();
    const name = `Idem-A-${Date.now()}`;

    const first = await postCustomer(idemKey, name).expect(201);
    const second = await postCustomer(idemKey, name).expect(200);

    const firstData = first.body.data;
    const secondData = second.body.data;
    expect(secondData.id).toBe(firstData.id);
    expect(second.body.meta.replayed).toBe(true);
    expect(first.body.meta?.replayed).toBeUndefined();

    const list = await api(app)
      .get('/api/v1/customers')
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(list.body.data.filter((c: { name: string }) => c.name === name)).toHaveLength(1);
  });

  it('a same-key retry after a successful run settles to the matched request hash', async () => {
    const idemKey = key();
    const name = `Idem-B-${Date.now()}`;
    await postCustomer(idemKey, name).expect(201);
    const replay = await postCustomer(idemKey, name).expect(200);
    expect(replay.body.meta.replayed).toBe(true);
  });

  it('rejects the same key with a different body (409)', async () => {
    const idemKey = key();
    await postCustomer(idemKey, `Idem-C-${Date.now()}`).expect(201);
    await postCustomer(idemKey, `Idem-D-${Date.now()}`).expect(409);
  });

  it('without a key, identical payloads create two rows', async () => {
    const name = `Idem-Plain-${Date.now()}`;
    await postCustomer(randomUUID(), name).expect(201);
    await postCustomer(randomUUID(), name).expect(201);

    const list = await api(app)
      .get('/api/v1/customers')
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(list.body.data.filter((c: { name: string }) => c.name === name)).toHaveLength(2);
  });
});