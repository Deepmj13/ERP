import { INestApplication } from '@nestjs/common';
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
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase-4 inventory happy-path (future.md Phase 4).
 *
 * Exercises: warehouse CRUD, adjustments (audited ADJUSTMENT movement),
 * transfers (TRANSFER_OUT + TRANSFER_IN, net zero), oversell rejection,
 * stocktake (STOCKTAKE to physical count), the movements ledger, low-stock
 * query, cross-tenant isolation and idempotent adjustment replay.
 *
 * Idempotency-Key header is required on all mutating endpoints.
 */

const IDEM = () => randomUUID();

describe('Inventory flow (Phase-4 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: RegisteredTenant;
  let otherTenant: RegisteredTenant;
  let productId: string;
  let whA: string;
  let whB: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await registerTenant(app);
    otherTenant = await registerTenant(app);

    const prodRes = await api(app)
      .post('/api/v1/products')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Inventory Widget', sku: `INV-${randomUUID().slice(0, 4)}`, salePrice: 100 })
      .expect(201);
    productId = prodRes.body.data.id;
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenant.tenantId, tenant.user.id);
    await cleanupTenant(prisma, otherTenant.tenantId, otherTenant.user.id);
    await closeTestApp(app);
  });

  describe('Warehouses', () => {
    it('creates two warehouses', async () => {
      const resA = await api(app)
        .post('/api/v1/warehouses')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ code: 'WH-A', name: 'Alpha Warehouse' })
        .expect(201);
      whA = resA.body.data.id;
      expect(resA.body.data.code).toBe('WH-A');

      const resB = await api(app)
        .post('/api/v1/warehouses')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ code: 'WH-B', name: 'Bravo Warehouse' })
        .expect(201);
      whB = resB.body.data.id;
      expect(resB.body.data.code).toBe('WH-B');
    });

    it('rejects a duplicate warehouse code', async () => {
      await api(app)
        .post('/api/v1/warehouses')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ code: 'WH-A', name: 'Duplicate' })
        .expect(400);
    });
  });

  describe('Stock adjustments', () => {
    it('adjusts +50 into WH-A and records an ADJUSTMENT movement', async () => {
      await api(app)
        .post('/api/v1/stock/adjustments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ warehouseId: whA, productId, quantity: 50, reason: 'Opening stock' })
        .expect(201);

      const res = await api(app)
        .get('/api/v1/stock')
        .set(authHeader(tenant.accessToken))
        .query({ warehouse: whA, product: productId })
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(Number(res.body.data[0].quantity)).toBe(50);
      expect(Number(res.body.data[0].available)).toBe(50);

      const movement = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, productId, warehouseId: whA, type: 'ADJUSTMENT' },
      });
      expect(movement).toBeTruthy();
      expect(Number(movement!.quantity)).toBe(50);
      expect(movement!.reason).toBe('Opening stock');
      expect(Number(movement!.balanceAfter)).toBe(50);
    });

    it('rejects a negative adjustment that would oversell', async () => {
      await api(app)
        .post('/api/v1/stock/adjustments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ warehouseId: whA, productId, quantity: -9999, reason: 'Oversell' })
        .expect(400);
    });
  });

  describe('Transfers', () => {
    it('transfers 30 from WH-A to WH-B — net zero, two movements', async () => {
      await api(app)
        .post('/api/v1/stock/transfers')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          lines: [{ fromWarehouseId: whA, toWarehouseId: whB, productId, quantity: 30 }],
        })
        .expect(201);

      const balanceA = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId: whA, productId } },
      });
      const balanceB = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId: whB, productId } },
      });
      expect(Number(balanceA!.quantity)).toBe(20);
      expect(Number(balanceB!.quantity)).toBe(30);

      const out = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, productId, warehouseId: whA, type: 'TRANSFER_OUT' },
      });
      const inn = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, productId, warehouseId: whB, type: 'TRANSFER_IN' },
      });
      expect(out).toBeTruthy();
      expect(Number(out!.quantity)).toBe(-30);
      expect(Number(out!.balanceAfter)).toBe(20);
      expect(inn).toBeTruthy();
      expect(Number(inn!.quantity)).toBe(30);
      expect(Number(inn!.balanceAfter)).toBe(30);
      expect(inn!.referenceType).toBe('STOCK_TRANSFER');
      expect(out!.referenceType).toBe('STOCK_TRANSFER');
    });
  });

  describe('Stocktake', () => {
    it('adjusts WH-A to a physical count of 25 (delta +5, STOCKTAKE)', async () => {
      const res = await api(app)
        .post('/api/v1/stock/takes')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ warehouseId: whA, productId, counted: 25, reason: 'Year end count' })
        .expect(201);
      expect(res.body.data.adjustment).toBe(5);

      const balance = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId: whA, productId } },
      });
      expect(Number(balance!.quantity)).toBe(25);

      const movement = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, productId, warehouseId: whA, type: 'STOCKTAKE' },
      });
      expect(movement).toBeTruthy();
      expect(Number(movement!.quantity)).toBe(5);
      expect(Number(movement!.balanceAfter)).toBe(25);
    });
  });

  describe('Ledger and low-stock', () => {
    it('GET /stock/movements filters by type and warehouse', async () => {
      const res = await api(app)
        .get('/api/v1/stock/movements')
        .set(authHeader(tenant.accessToken))
        .query({ warehouse: whA, type: 'TRANSFER_OUT' })
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('TRANSFER_OUT');
    });

    it('GET /stock/on-hand/low returns balances at or below threshold', async () => {
      const res = await api(app)
        .get('/api/v1/stock/on-hand/low')
        .set(authHeader(tenant.accessToken))
        .query({ threshold: 25 })
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Idempotent replay', () => {
    it('replays an adjustment with the same key without double-applying', async () => {
      const body = { warehouseId: whA, productId, quantity: 1, reason: 'Idempotent one' };
      const key = IDEM();
      const first = await api(app)
        .post('/api/v1/stock/adjustments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      const second = await api(app)
        .post('/api/v1/stock/adjustments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      expect(second.body).toEqual(first.body);
      expect(second.body.data.ok).toBe(true);

      const movements = await prisma.stockMovement.findMany({
        where: { tenantId: tenant.tenantId, productId, warehouseId: whA, reason: 'Idempotent one' },
      });
      expect(movements).toHaveLength(1);
    });
  });

  describe('Cross-tenant isolation', () => {
    it('Tenant B cannot see Tenant A stock, warehouses, movements or serials', async () => {
      const stock = await api(app)
        .get('/api/v1/stock')
        .set(authHeader(otherTenant.accessToken))
        .query({ product: productId })
        .expect(200);
      expect(stock.body.data).toHaveLength(0);

      const warehouses = await api(app)
        .get('/api/v1/warehouses')
        .set(authHeader(otherTenant.accessToken))
        .expect(200);
      expect(warehouses.body.data).toHaveLength(0);

      const movements = await api(app)
        .get('/api/v1/stock/movements')
        .set(authHeader(otherTenant.accessToken))
        .expect(200);
      expect(movements.body.data).toHaveLength(0);
    });
  });
});
