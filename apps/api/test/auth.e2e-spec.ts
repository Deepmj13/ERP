import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, api, registerTenant, cleanupTenant, closeTestApp } from './e2e-helpers';

describe('Auth (G-7 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, userId);
    await closeTestApp(app);
  });

  it('registers a tenant + owner and returns a usable session', async () => {
    const tenant = await registerTenant(app);
    tenantId = tenant.tenantId;
    userId = tenant.user.id;

    expect(tenant.refreshToken).toEqual(expect.any(String));
    expect(tenant.user.email).toBe(tenant.email);
    expect(tenant.user.name).toBe('E2E Owner');
  });

  it('logs in with the registered credentials', async () => {
    const tenant = await registerTenant(app);
    tenantId = tenant.tenantId;
    userId = tenant.user.id;

    const res = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: tenant.email, password: tenant.password })
      .expect(200);

    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.tenant.id).toBe(tenant.tenantId);
  });

  it('rejects login for an unknown account', async () => {
    await api(app)
      .post('/api/v1/auth/login')
      .send({ email: `ghost.${randomUUID()}@test.local`, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects an invalid registration payload (validation pipe)', async () => {
    await api(app)
      .post('/api/v1/auth/register')
      .send({ tenantName: '', name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('rejects /api/v1/auth/me without a bearer token', async () => {
    await api(app).get('/api/v1/auth/me').expect(401);
  });
});