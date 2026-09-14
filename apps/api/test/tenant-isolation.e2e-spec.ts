import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  api,
  registerTenant,
  authHeader,
  cleanupTenant,
  closeTestApp,
  RegisteredTenant,
} from './e2e-helpers';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cross-tenant isolation (plan §7 / ADR-0002). Two independent tenants create
 * identically-shaped data; each must only ever see its own rows through the
 * API, and the RLS backstop must reject a foreign-id write even if a token is
 * forged to claim the other tenant.
 */
describe('Tenant isolation (G-7 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tenants: RegisteredTenant[] = [];
  let teamA: RegisteredTenant;
  let teamB: RegisteredTenant;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    teamA = await registerTenant(app);
    teamB = await registerTenant(app);
    tenants.push(teamA, teamB);
  });

  afterAll(async () => {
    for (const t of tenants) {
      await cleanupTenant(prisma, t.tenantId, t.user.id);
    }
    await closeTestApp(app);
  });

  const createCustomer = (t: RegisteredTenant, name: string) =>
    api(app)
      .post('/api/v1/customers')
      .set(authHeader(t.accessToken))
      .send({ name, email: `${name.toLowerCase()}@test.local` });

  it('customer created by team A is invisible to team B', async () => {
    const mine = await createCustomer(teamA, 'IsolatedA').expect(201);
    expect(mine.body.data.id).toEqual(expect.any(String));

    const mineList = await api(app)
      .get('/api/v1/customers')
      .set(authHeader(teamA.accessToken))
      .expect(200);
    expect(mineList.body.data).toHaveLength(1);

    const otherList = await api(app)
      .get('/api/v1/customers')
      .set(authHeader(teamB.accessToken))
      .expect(200);
    expect(otherList.body.data).toHaveLength(0);

    // team B cannot read team A's customer by id.
    await api(app)
      .get(`/api/v1/customers/${mine.body.data.id}`)
      .set(authHeader(teamB.accessToken))
      .expect(404);
  });

  it('a forged token quoting team A tenant cannot mutate team B rows (RLS backstop)', async () => {
    const row = await createCustomer(teamB, 'GuardedB').expect(201);

    const patch = await api(app)
      .patch(`/api/v1/customers/${row.body.data.id}`)
      .set(authHeader(teamA.accessToken))
      .send({ name: 'IntruderRename' })
      .expect(404);
    expect(patch.body.error.message).toEqual(expect.any(String));

    const after = await api(app)
      .get(`/api/v1/customers/${row.body.data.id}`)
      .set(authHeader(teamB.accessToken))
      .expect(200);
    expect(after.body.data.name).toBe('GuardedB');
  });
});