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
 * Phase-6 procurement e2e (future.md Phase 6).
 *
 * Covers: vendor master, purchase request → purchase order (approval +
 * numbering), goods receipt (stock-in with PURCHASE ledger movement), vendor
 * bill (AP entry via FinanceService), vendor payment capture (allocation math,
 * AP settlement) and the key rejection paths.
 *
 * Idempotency-Key header is required on all mutating endpoints.
 */

const IDEM = () => randomUUID();

describe('Procurement flow (Phase-6 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: RegisteredTenant;
  let vendorId: string;
  let productId: string;
  let warehouseId: string;
  let bankAccountId: string;

  const accountIds: Record<string, string> = {};

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await registerTenant(app);

    const banksRes = await api(app)
      .post('/api/v1/bank-accounts')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Ops Bank', accountNumber: '654321', currency: 'USD' })
      .expect(201);
    bankAccountId = banksRes.body.data.id;

    warehouseId = randomUUID();
    await prisma.warehouse.create({
      data: { id: warehouseId, tenantId: tenant.tenantId, code: 'WH01', name: 'Main Warehouse' },
    });

    const vendRes = await api(app)
      .post('/api/v1/vendors')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Acme Supplies', email: 'supplies@acme.test' })
      .expect(201);
    vendorId = vendRes.body.data.id;

    const prodRes = await api(app)
      .post('/api/v1/products')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Raw Widget', sku: 'RAW-001', salePrice: 120 })
      .expect(201);
    productId = prodRes.body.data.id;

    const accRes = await api(app)
      .get('/api/v1/accounts')
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const rows = accRes.body.data.rows ?? accRes.body.data ?? [];
    for (const account of rows) accountIds[account.code] = account.id;
    expect(accountIds['1102']).toBeTruthy(); // Bank
    expect(accountIds['1104']).toBeTruthy(); // Inventory
    expect(accountIds['2101']).toBeTruthy(); // A/P
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenant.tenantId, tenant.user.id);
    await closeTestApp(app);
  });

  describe('Vendors', () => {
    it('creates and lists a vendor', async () => {
      const res = await api(app)
        .get('/api/v1/vendors')
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(res.body.data.some((v: { id: string; name: string }) => v.id === vendorId)).toBe(true);
    });
  });

  describe('Purchase request', () => {
    let requestId: string;

    it('creates a draft purchase request', async () => {
      const res = await api(app)
        .post('/api/v1/purchase-requests')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ items: [{ productId, description: 'Raw Widget x10', quantity: 10 }] })
        .expect(201);
      requestId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.items).toHaveLength(1);
    });

    it('rejects skipping the approval state machine', async () => {
      // DRAFT → APPROVE is not a legal transition
      await api(app)
        .post(`/api/v1/purchase-requests/${requestId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(400);
      await api(app)
        .post(`/api/v1/purchase-requests/${requestId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      // double submit
      await api(app)
        .post(`/api/v1/purchase-requests/${requestId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(400);
    });

    it('approves and assigns a PR- number', async () => {
      const res = await api(app)
        .post(`/api/v1/purchase-requests/${requestId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.number).toMatch(/^PR-/);
    });
  });

  describe('Purchase order', () => {
    let orderId: string;
    let unapprovedRequestId: string;

    beforeAll(async () => {
      const res = await api(app)
        .post('/api/v1/purchase-requests')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ items: [{ productId, description: 'Never approved', quantity: 5 }] })
        .expect(201);
      unapprovedRequestId = res.body.data.id;
    });

    it('rejects ordering against an unapproved request', async () => {
      await api(app)
        .post('/api/v1/purchase-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          sourceRequestId: unapprovedRequestId,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(400);
    });

    it('creates, submits and approves an order against an approved request', async () => {
      const approvedReq = await api(app)
        .post('/api/v1/purchase-requests')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ items: [{ productId, description: 'Authorized', quantity: 10 }] })
        .expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${approvedReq.body.data.id}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${approvedReq.body.data.id}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const res = await api(app)
        .post('/api/v1/purchase-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          sourceRequestId: approvedReq.body.data.id,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      orderId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
      expect(Number(res.body.data.total)).toBe(1000);

      // request rolls to ORDERED once ordered
      const request = await api(app)
        .get(`/api/v1/purchase-requests/${approvedReq.body.data.id}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(request.body.data.status).toBe('ORDERED');

      await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      const approved = await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(approved.body.data.number).toMatch(/^PO-/);
    });
  });

  describe('Goods receipt', () => {
    let receiptId: string;
    let orderId: string;

    beforeAll(async () => {
      const req = await api(app)
        .post('/api/v1/purchase-requests')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ items: [{ productId, description: 'GRN flow', quantity: 10 }] })
        .expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${req.body.data.id}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${req.body.data.id}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const order = await api(app)
        .post('/api/v1/purchase-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          sourceRequestId: req.body.data.id,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      orderId = order.body.data.id;
      await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
    });

    it('creates and posts a goods receipt with a PURCHASE movement', async () => {
      const res = await api(app)
        .post('/api/v1/goods-receipts')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          purchaseOrderId: orderId,
          warehouseId,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitCost: 80 }],
        })
        .expect(201);
      receiptId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');

      const posted = await api(app)
        .post(`/api/v1/goods-receipts/${receiptId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      expect(posted.body.data.status).toBe('RECEIVED');
      expect(posted.body.data.number).toMatch(/^GRN-/);

      const order = await api(app)
        .get(`/api/v1/purchase-orders/${orderId}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(order.body.data.status).toBe('RECEIVED');
      expect(Number(order.body.data.items[0].receivedQty)).toBe(10);

      const movement = await prisma.stockMovement.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'GRN', referenceId: receiptId },
      });
      expect(movement).toBeTruthy();
      expect(Number(movement!.quantity)).toBe(10);
      expect(Number(movement!.balanceAfter)).toBe(10);

      // re-post is rejected
      await api(app)
        .post(`/api/v1/goods-receipts/${receiptId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(400);
    });

    it('rejects a receipt for a non-approved order', async () => {
      const draft = await api(app)
        .post('/api/v1/purchase-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ vendorId, items: [{ productId, description: 'Draft order', quantity: 1, unitPrice: 100 }] })
        .expect(201);
      await api(app)
        .post('/api/v1/goods-receipts')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          purchaseOrderId: draft.body.data.id,
          warehouseId,
          items: [{ productId, description: 'Too early', quantity: 1 }],
        })
        .expect(400);
    });
  });

  describe('Vendor bill + payment', () => {
    let billId: string;
    let orderId: string;
    let receiptId: string;

    beforeAll(async () => {
      // reuse the posted PO/GRN flow for a fully received order
      const req = await api(app)
        .post('/api/v1/purchase-requests')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ items: [{ productId, description: 'Billed flow', quantity: 10 }] })
        .expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${req.body.data.id}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/purchase-requests/${req.body.data.id}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const order = await api(app)
        .post('/api/v1/purchase-orders')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          sourceRequestId: req.body.data.id,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      orderId = order.body.data.id;
      await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/purchase-orders/${orderId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const grn = await api(app)
        .post('/api/v1/goods-receipts')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          purchaseOrderId: orderId,
          warehouseId,
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitCost: 80 }],
        })
        .expect(201);
      receiptId = grn.body.data.id;
      await api(app)
        .post(`/api/v1/goods-receipts/${receiptId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
    });

    it('creates, approves and posts a vendor bill with an A/P entry', async () => {
      const created = await api(app)
        .post('/api/v1/vendor-bills')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          purchaseOrderId: orderId,
          goodsReceiptId: receiptId,
          issueDate: new Date().toISOString(),
          items: [{ productId, description: 'Raw Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      billId = created.body.data.id;
      expect(created.body.data.status).toBe('DRAFT');
      expect(Number(created.body.data.total)).toBe(1000);
      expect(Number(created.body.data.balance)).toBe(1000);

      await api(app)
        .post(`/api/v1/vendor-bills/${billId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/vendor-bills/${billId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const posted = await api(app)
        .post(`/api/v1/vendor-bills/${billId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      expect(posted.body.data.status).toBe('POSTED');
      expect(posted.body.data.number).toMatch(/^VB-/);

      const entry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'VENDOR_BILL', referenceId: billId },
        include: { lines: true },
      });
      expect(entry).toBeTruthy();
      expect(entry!.number).toMatch(/^JE-/);
      const mapped = new Map(entry!.lines.map((l) => [l.accountId, { debit: Number(l.debit), credit: Number(l.credit) }]));
      expect(Number(mapped.get(accountIds['1104'])!.debit)).toBe(1000); // Inventory
      expect(Number(mapped.get(accountIds['2101'])!.credit)).toBe(1000); // A/P

      // re-post is rejected
      await api(app)
        .post(`/api/v1/vendor-bills/${billId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(400);
    });

    it('rejects a payment allocation exceeding the bill balance', async () => {
      const extra = await api(app)
        .post('/api/v1/vendor-bills')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          issueDate: new Date().toISOString(),
          items: [{ productId, description: 'Partial bill', quantity: 5, unitPrice: 100 }],
        })
        .expect(201);
      await api(app)
        .post(`/api/v1/vendor-bills/${extra.body.data.id}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/vendor-bills/${extra.body.data.id}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/vendor-bills/${extra.body.data.id}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const payRes = await api(app)
        .post('/api/v1/vendor-payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          bankAccountId,
          amount: 1000,
          method: 'BANK',
          allocations: [{ vendorBillId: extra.body.data.id, amount: 600 }],
        })
        .expect(201);
      await api(app)
        .post(`/api/v1/vendor-payments/${payRes.body.data.id}/capture`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .send({ allocations: [{ vendorBillId: extra.body.data.id, amount: 600 }] })
        .expect(400); // bill balance is 500
    });

    it('captures a vendor payment, settles the bill and posts an A/P entry', async () => {
      const payRes = await api(app)
        .post('/api/v1/vendor-payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          vendorId,
          bankAccountId,
          amount: 1000,
          method: 'BANK',
          allocations: [{ vendorBillId: billId, amount: 1000 }],
        })
        .expect(201);

      const captured = await api(app)
        .post(`/api/v1/vendor-payments/${payRes.body.data.id}/capture`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .send({ allocations: [{ vendorBillId: billId, amount: 1000 }] })
        .expect(201);
      expect(captured.body.data.status).toBe('CAPTURED');
      expect(captured.body.data.number).toMatch(/^VP-/);

      const bill = await api(app)
        .get(`/api/v1/vendor-bills/${billId}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(bill.body.data.status).toBe('PAID');
      expect(Number(bill.body.data.balance)).toBe(0);

      const entry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'VENDOR_PAYMENT', referenceId: payRes.body.data.id },
        include: { lines: true },
      });
      expect(entry).toBeTruthy();
      const mapped = new Map(entry!.lines.map((l) => [l.accountId, { debit: Number(l.debit), credit: Number(l.credit) }]));
      expect(Number(mapped.get(accountIds['2101'])!.debit)).toBe(1000); // A/P
      expect(Number(mapped.get(accountIds['1102'])!.credit)).toBe(1000); // Bank
    });

    it('voids only a pending payment with no allocations', async () => {
      const payRes = await api(app)
        .post('/api/v1/vendor-payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ vendorId, amount: 250, method: 'CASH', allocations: [{ vendorBillId: billId, amount: 250 }] })
        .expect(201);
      // void with allocations on DTO is not the issue; void requires nothing allocated yet
      await api(app)
        .post(`/api/v1/vendor-payments/${payRes.body.data.id}/void`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM())
        .expect(201);
      const res = await api(app)
        .get(`/api/v1/vendor-payments/${payRes.body.data.id}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(res.body.data.status).toBe('VOID');
    });
  });
});