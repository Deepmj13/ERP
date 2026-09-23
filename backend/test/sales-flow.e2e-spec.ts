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
 * Phase-3 full sales happy-path (future.md Phase 3).
 *
 * Flow: quote → order → delivery → invoice → payment
 *
 * Exercises: quotation CRUD + status transitions, sales order, delivery
 * (stock-out enforcement with sufficient balance), invoice (post), payment
 * capture with allocation math, document numbering, and cleanup ordering.
 *
 * Idempotency-Key header is required on all mutating endpoints.
 */

const IDEM = () => randomUUID();

describe('Sales flow (Phase-3 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: RegisteredTenant;
  let customerId: string;
  let productId: string;
  let warehouseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await registerTenant(app);

    // Seed warehouse directly (no HTTP controller yet)
    warehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        tenantId: tenant.tenantId,
        code: 'WH01',
        name: 'Main Warehouse',
      },
    });

    // Seed customer via API
    const custRes = await api(app)
      .post('/api/v1/customers')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Acme Corp', email: 'acme@test.local' });
    customerId = custRes.body.data.id;

    // Seed product via API (salePrice field)
    const prodRes = await api(app)
      .post('/api/v1/products')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Widget', sku: 'WG-001', salePrice: 100 });
    productId = prodRes.body.data.id;

    // Seed 50 units of stock
    await prisma.stockBalance.create({
      data: { warehouseId, productId, tenantId: tenant.tenantId, quantity: 50 },
    });
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenant.tenantId, tenant.user.id);
    await closeTestApp(app);
  });

  let quotationId: string;
  let orderId: string;
  let deliveryId: string;
  let invoiceId: string;
  let paymentId: string;

  describe('Quotation', () => {
    it('creates a draft quotation with line items', async () => {
      const res = await api(app)
        .post('/api/v1/quotations')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          items: [{ productId, description: 'Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);

      quotationId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.items).toHaveLength(1);
      expect(Number(res.body.data.total)).toBe(1000);
    });

    it('transitions SUBMITTED → APPROVED and receives QTO-number', async () => {
      await api(app)
        .post(`/api/v1/quotations/${quotationId}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      const approveRes = await api(app)
        .post(`/api/v1/quotations/${quotationId}/approve`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.number).toMatch(/^QTO-/);
    });
  });

  describe('Sales Order', () => {
    it('converts an approved quotation to a sales order', async () => {
      const res = await api(app)
        .post(`/api/v1/quotations/${quotationId}/convert`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      orderId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
      expect(Number(res.body.data.total)).toBe(1000);
    });

    it('transitions SUBMITTED → APPROVED and receives SO-number', async () => {
      await api(app)
        .post(`/api/v1/sales-orders/${orderId}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      const approveRes = await api(app)
        .post(`/api/v1/sales-orders/${orderId}/approve`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.number).toMatch(/^SO-/);
    });
  });

  describe('Delivery', () => {
    it('creates and posts a delivery (stock decremented)', async () => {
      const delRes = await api(app)
        .post('/api/v1/deliveries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          salesOrderId: orderId,
          warehouseId,
          items: [{ productId, description: 'Widget x10', quantity: 10 }],
        })
        .expect(201);
      deliveryId = delRes.body.data.id;
      expect(delRes.body.data.status).toBe('DRAFT');

      await api(app)
        .post(`/api/v1/deliveries/${deliveryId}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      const postRes = await api(app)
        .post(`/api/v1/deliveries/${deliveryId}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(postRes.body.data.status).toBe('POSTED');
      expect(postRes.body.data.number).toMatch(/^DEL-/);

      const balance = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(Number(balance!.quantity)).toBe(40);

      const movement = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, productId, warehouseId },
      });
      expect(movement).toBeTruthy();
      expect(Number(movement!.quantity)).toBe(-10);
      expect(movement!.type).toBe('SALE');
    });

    it('rejects a delivery that would oversell', async () => {
      // Create + approve a second order for 50 units
      const orderRes = await api(app)
        .post('/api/v1/sales-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          items: [{ productId, description: 'Big order', quantity: 50, unitPrice: 100 }],
        });
      const secondOrderId = orderRes.body.data.id;

      await api(app)
        .post(`/api/v1/sales-orders/${secondOrderId}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM());
      await api(app)
        .post(`/api/v1/sales-orders/${secondOrderId}/approve`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM());

      const del2Res = await api(app)
        .post('/api/v1/deliveries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          salesOrderId: secondOrderId,
          warehouseId,
          items: [{ productId, description: 'Oversell', quantity: 50 }],
        });

      await api(app)
        .post(`/api/v1/deliveries/${del2Res.body.data.id}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM());

      await api(app)
        .post(`/api/v1/deliveries/${del2Res.body.data.id}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(400);

      // Stock unchanged
      const balance = await prisma.stockBalance.findUnique({
        where: { warehouseId_productId: { warehouseId, productId } },
      });
      expect(Number(balance!.quantity)).toBe(40);
    });
  });

  describe('Invoice', () => {
    it('creates and posts an invoice DRAFT → SUBMITTED → APPROVED → POSTED', async () => {
      const createRes = await api(app)
        .post('/api/v1/invoices')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          salesOrderId: orderId,
          deliveryId,
          issueDate: new Date().toISOString(),
          items: [{ productId, description: 'Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      invoiceId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('DRAFT');

      await api(app)
        .post(`/api/v1/invoices/${invoiceId}/submit`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      await api(app)
        .post(`/api/v1/invoices/${invoiceId}/approve`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      const postRes = await api(app)
        .post(`/api/v1/invoices/${invoiceId}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(postRes.body.data.status).toBe('POSTED');
      expect(postRes.body.data.number).toMatch(/^INV-/);
    });
  });

  describe('Payment', () => {
    it('creates and captures a payment with invoice allocation', async () => {
      const createRes = await api(app)
        .post('/api/v1/payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          amount: 1000,
          method: 'CASH',
          allocations: [{ invoiceId, amount: 1000 }],
        })
        .expect(201);
      paymentId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('PENDING');

      const captureRes = await api(app)
        .post(`/api/v1/payments/${paymentId}/capture`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ allocations: [{ invoiceId, amount: 1000 }] })
        .expect(201);

      expect(captureRes.body.data.status).toBe('CAPTURED');
      expect(captureRes.body.data.number).toMatch(/^PAY-/);

      const invoiceRes = await api(app)
        .get(`/api/v1/invoices/${invoiceId}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(invoiceRes.body.data.status).toBe('PAID');
      expect(Number(invoiceRes.body.data.balance)).toBe(0);
    });

    it('rejects capture exceeding invoice balance', async () => {
      const createRes = await api(app)
        .post('/api/v1/payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          amount: 9999,
          method: 'BANK_TRANSFER',
          allocations: [{ invoiceId, amount: 9999 }],
        })
        .expect(201);

      await api(app)
        .post(`/api/v1/payments/${createRes.body.data.id}/capture`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ allocations: [{ invoiceId, amount: 9999 }] })
        .expect(400);
    });
  });
});
