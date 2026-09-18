import { createHash } from 'crypto';
import { DocumentNumberingService, AllocatedNumber } from './document-numbering.service';

/**
 * G-1 sequence allocation (plan §12 / ADR-0006).
 *
 * The raw-SQL behavior is mocked; these tests pin the allocation contract:
 * deterministic number format, mode dispatch, financial-year rollover, and the
 * collision retry loop. Parallel/concurrency behavior is covered by the e2e
 * sequence tests (plan §25) against a real database.
 */

function seqNameOf(tenantId: string, docType: string, year: number): string {
  // Mirrors the private sequenceName() — deterministic hash-based identifier.
  const hash = createHash('sha256').update(`${tenantId}:${docType}:${year}`).digest('hex');
  return `seq_doc_${hash.slice(0, 24)}`;
}

function makePrisma(
  mocks: { nextval?: number; gapless?: number; errors?: Error[]; emptyNextval?: boolean; emptyGapless?: boolean } = {},
) {
  let call = 0;
  const queryRawUnsafe = jest.fn(async (_sql: string): Promise<unknown> => {
    return undefined;
  });
  const queryRaw = jest.fn(async (strings: TemplateStringsArray, ..._args: unknown[]) => {
    const sql = strings.join('?');
    if (sql.includes('nextval')) {
      if (mocks.errors && call < mocks.errors.length) throw mocks.errors[call++];
      call++;
      if (mocks.emptyNextval) return [];
      return [{ n: BigInt(mocks.nextval ?? 1) }];
    }
    if (sql.includes('INSERT INTO document_sequences')) {
      if (mocks.errors && call < mocks.errors.length) throw mocks.errors[call++];
      call++;
      if (mocks.emptyGapless) return [];
      return [{ n: BigInt(mocks.gapless ?? 1) }];
    }
    if (sql.includes('pg_class')) return [];
    return [];
  });
  return {
    queryRaw,
    queryRawUnsafe,
    instance: { $queryRaw: queryRaw, $queryRawUnsafe: queryRawUnsafe } as any,
  };
}

describe('DocumentNumberingService (G-1)', () => {
  const TENANT = 't-1';
  const DOC = 'INVOICE';

  it('allocates a gapped number formatted as <prefix><year>-<padded>', async () => {
    const { instance } = makePrisma({ nextval: 7 });
    const service = new DocumentNumberingService(instance);

    const out = await service.allocateNumber(TENANT, DOC);

    expect(out.number).toBe('INVOICE-2026-000007');
    expect(out.rawSeq).toBe(7);
    expect(out.financialYear).toBe(new Date().getFullYear());
  });

  it('honors a custom prefix, year and padding', async () => {
    const { instance } = makePrisma({ nextval: 42 });
    const service = new DocumentNumberingService(instance);

    const out = await service.allocateNumber(TENANT, 'SO', {
      prefix: 'SO/',
      financialYear: 2027,
      padLength: 4,
    });

    expect(out.number).toBe('SO/2027-0042');
  });

  it('uses the per-(tenant,type,year) sequence in gapped mode', async () => {
    const { instance, queryRaw, queryRawUnsafe } = makePrisma({ nextval: 3 });
    const service = new DocumentNumberingService(instance);
    const expectedSeq = seqNameOf(TENANT, DOC, 2026);

    await service.allocateNumber(TENANT, DOC, { financialYear: 2026 });

    const calls = [
      ...queryRawUnsafe.mock.calls.map((c) => String(c[0])),
      ...queryRaw.mock.calls.map((c) =>
        c[0].join('?') + ' ' + c.slice(1).map(String).join(' '),
      ),
    ];
    expect(calls.some((s) => s.includes('pg_class'))).toBe(true);
    expect(calls.some((s) => s.includes('nextval') && s.includes(expectedSeq))).toBe(true);
  });

  it('allocates gapless numbers from the counter row', async () => {
    const { instance, queryRaw } = makePrisma({ gapless: 9 });
    const service = new DocumentNumberingService(instance);

    const out = await service.allocateNumber(TENANT, 'TAXINV', { mode: 'gapless' });

    expect(out.rawSeq).toBe(9);
    expect(out.number.endsWith('-000009')).toBe(true);
    const sql = queryRaw.mock.calls.find((c) => c[0].join('?').includes('INSERT INTO document_sequences'))?.[0].join('?');
    expect(sql).toContain('ON CONFLICT (tenant_id, document_type, financial_year)');
  });

  it('retries on PG serialization failure (40001) then succeeds', async () => {
    const serialization = Object.assign(new Error('deadlock detected'), { code: '40001' });
    const { instance } = makePrisma({ nextval: 5, errors: [serialization] });
    const service = new DocumentNumberingService(instance);

    const out: AllocatedNumber = await service.allocateNumber(TENANT, DOC);
    expect(out.number).toBe(`INVOICE-2026-${String(5).padStart(6, '0')}`);
  });

  it('retries on unique violation (23505) then succeeds', async () => {
    const collision = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { instance } = makePrisma({ gapless: 5, errors: [collision] });
    const service = new DocumentNumberingService(instance);

    const out = await service.allocateNumber(TENANT, 'PO', { mode: 'gapless' });
    expect(out.rawSeq).toBe(5);
  });

  it('rethrows non-retryable errors', async () => {
    const err = Object.assign(new Error('connection refused'), { code: '08006' });
    const { instance } = makePrisma({ nextval: 1, errors: [err] });
    const service = new DocumentNumberingService(instance);

    await expect(service.allocateNumber(TENANT, DOC)).rejects.toThrow('connection refused');
  });

  it('rethrows after exhausting retries on persistent collisions', async () => {
    const collision = Object.assign(new Error('dup'), { code: '23505' });
    const { instance } = makePrisma({ nextval: 1, errors: [collision, collision, collision] });
    const service = new DocumentNumberingService(instance);

    await expect(service.allocateNumber(TENANT, DOC)).rejects.toThrow('dup');
  });

  it('supports allocating inside a caller transaction (tx passthrough)', async () => {
    const tx = makePrisma({ nextval: 11 }).instance;
    const { instance } = makePrisma();
    const service = new DocumentNumberingService(instance);

    const out = await service.allocateNumber(TENANT, DOC, {}, tx);

    expect(out.rawSeq).toBe(11);
  });

  it('throws a descriptive error when gapped allocation returns no row', async () => {
    const { instance } = makePrisma({ emptyNextval: true });
    const service = new DocumentNumberingService(instance);

    await expect(service.allocateNumber(TENANT, DOC)).rejects.toThrow(/no row/);
  });

  it('throws a descriptive error when gapless allocation returns no row (RLS unarmed)', async () => {
    const { instance } = makePrisma({ emptyGapless: true });
    const service = new DocumentNumberingService(instance);

    await expect(service.allocateNumber(TENANT, 'TAXINV', { mode: 'gapless' })).rejects.toThrow(
      /RLS/,
    );
  });
});