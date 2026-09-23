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
 * Phase-5 finance e2e (future.md Phase 5).
 *
 * Covers: auto-seeded chart of accounts for registered tenants, non-system
 * account provisioning, manual journal lifecycle (draft → post → reverse),
 * fiscal period open/close gating, bank transaction import/reconcile/match,
 * invoice/payment auto-posting into the ledger, and the trial balance report.
 *
 * Idempotency-Key header is required on all mutating endpoints.
 */

const IDEM = () => randomUUID();

describe('Finance flow (Phase-5 e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: RegisteredTenant;
  let customerId: string;
  let productId: string;
  let warehouseId: string;
  let bankAccountId: string;

  const accountIds: Record<string, string> = {};
  let customerAccountId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tenant = await registerTenant(app);

    const banksRes = await api(app)
      .post('/api/v1/bank-accounts')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Main Bank', accountNumber: '123456', currency: 'USD' })
      .expect(201);
    bankAccountId = banksRes.body.data.id;

    warehouseId = randomUUID();
    await prisma.warehouse.create({
      data: { id: warehouseId, tenantId: tenant.tenantId, code: 'WH01', name: 'Main Warehouse' },
    });

    const custRes = await api(app)
      .post('/api/v1/customers')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Acme Corp', email: 'acme@test.local' })
      .expect(201);
    customerId = custRes.body.data.id;

    const prodRes = await api(app)
      .post('/api/v1/products')
      .set(authHeader(tenant.accessToken))
      .set('Idempotency-Key', IDEM())
      .send({ name: 'Widget', sku: 'WG-001', salePrice: 100 })
      .expect(201);
    productId = prodRes.body.data.id;

    await prisma.stockBalance.create({
      data: { warehouseId, productId, tenantId: tenant.tenantId, quantity: 50 },
    });
  });

  afterAll(async () => {
    await cleanupTenant(prisma, tenant.tenantId, tenant.user.id);
    await closeTestApp(app);
  });

  describe('Chart of accounts', () => {
    it('auto-seeds the standard COA at registration', async () => {
      const res = await api(app)
        .get('/api/v1/accounts')
        .set(authHeader(tenant.accessToken))
        .expect(200);

      const accounts = res.body.data.rows ?? res.body.data ?? [];
      const rows = Array.isArray(accounts) ? accounts : accounts;
      expect(rows.length).toBeGreaterThanOrEqual(23);
      for (const account of rows) accountIds[account.code] = account.id;
      expect(accountIds['1102']).toBeTruthy(); // Bank
      expect(accountIds['1103']).toBeTruthy(); // A/R
      expect(accountIds['4101']).toBeTruthy(); // Sales Revenue
      expect(accountIds['2102']).toBeTruthy(); // Output Tax
    });

    it('protects system accounts from editing', async () => {
      await api(app)
        .patch(`/api/v1/accounts/${accountIds['1103']}`)
        .set(authHeader(tenant.accessToken))
        .send({ name: 'Hacked Receivables' })
        .expect(400);
    });

    it('creates custom (non-system) accounts', async () => {
      const groups = await api(app)
        .get('/api/v1/accounts/account-groups')
        .set(authHeader(tenant.accessToken))
        .expect(200);
      const expenseGroup = groups.body.data.find((g: { code: string }) => g.code === '5200');
      expect(expenseGroup).toBeTruthy();

      const res = await api(app)
        .post('/api/v1/accounts')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          accountGroupId: expenseGroup.id,
          code: '5206',
          name: 'Software Licenses',
          type: 'EXPENSE',
        })
        .expect(201);
      customerAccountId = res.body.data.id;
      expect(res.body.data.isSystem).toBe(false);
    });
  });

  describe('Journal entries', () => {
    let journalId: string;

    it('rejects an unbalanced draft', async () => {
      await api(app)
        .post('/api/v1/journal-entries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          entryDate: new Date().toISOString(),
          description: 'Unbalanced',
          lines: [{ accountId: accountIds['1101'], debit: 100 }],
        })
        .expect(400);
    });

    it('posts a balanced manual entry and assigns a JE number', async () => {
      const createRes = await api(app)
        .post('/api/v1/journal-entries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          entryDate: new Date().toISOString(),
          description: 'Manual note',
          lines: [
            { accountId: accountIds['1101'], debit: 250, narration: 'Owner contribution' },
            { accountId: customerAccountId, credit: 250, narration: 'Owner contribution contra' },
          ],
        })
        .expect(201);
      journalId = createRes.body.data.id;
      expect(createRes.body.data.status).toBe('DRAFT');

      const postRes = await api(app)
        .post(`/api/v1/journal-entries/${journalId}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(postRes.body.data.status).toBe('POSTED');
      expect(postRes.body.data.number).toMatch(/^JE-/);

      // Idempotent — a posted entry cannot be re-posted
      await api(app)
        .post(`/api/v1/journal-entries/${journalId}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(400);
    });

    it('reverses a posted entry with swapped lines', async () => {
      const revRes = await api(app)
        .post(`/api/v1/journal-entries/${journalId}/reverse`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      expect(revRes.body.data.status).toBe('POSTED');
      expect(revRes.body.data.reversedById).toBe(journalId);

      const source = await api(app)
        .get(`/api/v1/journal-entries/${journalId}`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(source.body.data.status).toBe('REVERSED');

      const lines = revRes.body.data.lines;
      expect(lines).toHaveLength(2);
      expect(Number(lines[0].credit)).toBe(250);
      expect(Number(lines[1].debit)).toBe(250);
    });
  });

  describe('Fiscal periods', () => {
    let periodId: string;
    const inPeriod = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

    it('creates a fiscal period that is open', async () => {
      const res = await api(app)
        .post('/api/v1/fiscal-periods')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          name: 'FY Forward',
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);
      periodId = res.body.data.id;
      expect(res.body.data.status).toBe('OPEN');
    });

    it('posts inside the open period', async () => {
      const createRes = await api(app)
        .post('/api/v1/journal-entries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          entryDate: inPeriod.toISOString(),
          description: 'Open-period entry',
          lines: [
            { accountId: accountIds['1101'], debit: 30 },
            { accountId: accountIds['1106'], credit: 30 },
          ],
        })
        .expect(201);
      await api(app)
        .post(`/api/v1/journal-entries/${createRes.body.data.id}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);
    });

    it('rejects posting once the period is closed', async () => {
      await api(app)
        .post(`/api/v1/fiscal-periods/${periodId}/close`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);

      const createRes = await api(app)
        .post('/api/v1/journal-entries')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          entryDate: inPeriod.toISOString(),
          description: 'Closed-period entry',
          lines: [
            { accountId: accountIds['1101'], debit: 5 },
            { accountId: accountIds['1106'], credit: 5 },
          ],
        })
        .expect(201);
      await api(app)
        .post(`/api/v1/journal-entries/${createRes.body.data.id}/post`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(400);
    });
  });

  describe('Auto-posting from sales documents', () => {
    let orderId: string;
    let deliveryId: string;
    let invoiceId: string;
    let paymentId: string;

    beforeAll(async () => {
      const quoteRes = await api(app)
        .post('/api/v1/quotations')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          customerId,
          items: [{ productId, description: 'Widget x10', quantity: 10, unitPrice: 100 }],
        })
        .expect(201);
      const quotationId = quoteRes.body.data.id;
      await api(app)
        .post(`/api/v1/quotations/${quotationId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/quotations/${quotationId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const orderRes = await api(app)
        .post(`/api/v1/quotations/${quotationId}/convert`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .expect(201);
      orderId = orderRes.body.data.id;
      await api(app)
        .post(`/api/v1/sales-orders/${orderId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/sales-orders/${orderId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

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
      await api(app)
        .post(`/api/v1/deliveries/${deliveryId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/deliveries/${deliveryId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const invRes = await api(app)
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
      invoiceId = invRes.body.data.id;
      await api(app)
        .post(`/api/v1/invoices/${invoiceId}/submit`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
      await api(app)
        .post(`/api/v1/invoices/${invoiceId}/approve`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);
    });

    it('posts the AR / Revenue / Output-Tax entry on invoice post', async () => {
      await api(app)
        .post(`/api/v1/invoices/${invoiceId}/post`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const entry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'INVOICE', referenceId: invoiceId },
        include: { lines: true },
      });
      expect(entry).toBeTruthy();
      expect(entry!.number).toMatch(/^JE-/);
      expect(entry!.status).toBe('POSTED');

      const mapped = new Map(entry!.lines.map((l) => [l.accountId, { debit: Number(l.debit), credit: Number(l.credit) }]));
      expect(Number(mapped.get(accountIds['1103'])!.debit)).toBe(1000);
      expect(Number(mapped.get(accountIds['4101'])!.credit)).toBe(1000);
      expect(Number(mapped.get(accountIds['2102'])!.credit)).toBe(0);
    });

    it('posts the Bank / A/R entry on payment capture', async () => {
      const payRes = await api(app)
        .post('/api/v1/payments')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ customerId, amount: 1000, method: 'CASH', allocations: [{ invoiceId, amount: 1000 }] })
        .expect(201);
      paymentId = payRes.body.data.id;

      await api(app)
        .post(`/api/v1/payments/${paymentId}/capture`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ allocations: [{ invoiceId, amount: 1000 }] })
        .expect(201);

      const entry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'PAYMENT', referenceId: paymentId },
        include: { lines: true },
      });
      expect(entry).toBeTruthy();
      const mapped = new Map(entry!.lines.map((l) => [l.accountId, { debit: Number(l.debit), credit: Number(l.credit) }]));
      expect(Number(mapped.get(accountIds['1102'])!.debit)).toBe(1000); // Bank
      expect(Number(mapped.get(accountIds['1103'])!.credit)).toBe(1000); // A/R
    });

    it('renders a balanced trial balance', async () => {
      const res = await api(app)
        .get('/api/v1/reports/trial-balance')
        .set(authHeader(tenant.accessToken))
        .expect(200);

      const totals = res.body.data.totals;
      expect(Number(totals.debit)).toBe(Number(totals.credit));
      expect(Number(totals.debit)).toBeGreaterThan(0);
    });
  });

  describe('Bank transactions', () => {
    let txnId: string;

    it('imports statement rows and matches a posted entry', async () => {
      const importRes = await api(app)
        .post('/api/v1/bank-transactions/import')
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({
          rows: [
            {
              bankAccountId,
              entryDate: new Date().toISOString(),
              amount: 1000,
              reference: 'STMT-001',
              description: 'Client receipt',
            },
          ],
        })
        .expect(201);
      expect(importRes.body.data).toHaveLength(1);
      txnId = importRes.body.data[0].id;

      await api(app)
        .post(`/api/v1/bank-transactions/${txnId}/reconcile`)
        .set(authHeader(tenant.accessToken)).set('Idempotency-Key', IDEM()).expect(201);

      const listRes = await api(app)
        .get('/api/v1/bank-transactions?status=RECONCILED')
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(listRes.body.data.length).toBe(1);
    });

    it('matches a transaction to a posted journal entry', async () => {
      const paymentEntry = await prisma.journalEntry.findFirst({
        where: { tenantId: tenant.tenantId, referenceType: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
      });
      await api(app)
        .post(`/api/v1/bank-transactions/${txnId}/match`)
        .set(authHeader(tenant.accessToken))
        .set('Idempotency-Key', IDEM())
        .send({ journalEntryId: paymentEntry!.id })
        .expect(201);

      const res = await api(app)
        .get(`/api/v1/bank-transactions?status=MATCHED`)
        .set(authHeader(tenant.accessToken))
        .expect(200);
      expect(res.body.data.length).toBe(1);
    });
  });
});