import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';

export type SequenceMode = 'gapped' | 'gapless';

export interface AllocateNumberOptions {
  /** `gapped` (default) uses a PG sequence; `gapless` uses the counter row (ADR-0006). */
  mode?: SequenceMode;
  /** Document number prefix, e.g. `INV-`. Defaults to `<docType>-`. */
  prefix?: string;
  /** Financial year. Defaults to the calendar year of `today`. */
  financialYear?: number;
  /** Zero-padding width of the sequence part (default 6). */
  padLength?: number;
}

export interface AllocatedNumber {
  /** Full user-visible number, e.g. `INV-2026-000001`. */
  number: string;
  /** Raw sequence value allocated. */
  rawSeq: number;
  financialYear: number;
}

/** PG serialization / unique-violation SQLSTATEs the allocation retries on (ADR-0006). */
const PG_SERIALIZATION_FAILURE = '40001';
const PG_UNIQUE_VIOLATION = '23505';
const MAX_RETRIES = 3;
const DEFAULT_PAD = 6;

interface SequenceRow {
  n: bigint;
}

/**
 * Document numbering (plan §12 / ADR-0006 / G-1).
 *
 * Numbers are assigned at post/issue time — never at draft creation — and
 * always inside the caller's transaction, so the document row and its number
 * commit atomically. Two modes:
 *
 * - `gapped` (default): a PostgreSQL SEQUENCE per (tenant, type, year). Fast,
 *   no cross-transaction locking, gaps allowed.
 * - `gapless`: increments the `document_sequences` counter row with a row lock,
 *   producing a contiguous range for statutory documents.
 *
 * Pass the optional `tx` (e.g. from `PrismaService.withTenant`) to allocate
 * inside the caller's transaction; otherwise the allocation is its own
 * (RLS-armed) statement.
 */
@Injectable()
export class DocumentNumberingService {
  private readonly logger = new Logger(DocumentNumberingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async allocateNumber(
    tenantId: string,
    docType: string,
    options: AllocateNumberOptions = {},
    tx?: PrismaClient,
  ): Promise<AllocatedNumber> {
    const year = options.financialYear ?? this.financialYear(new Date());
    const prefix = (options.prefix ?? `${docType}-`).trim();
    const pad = options.padLength ?? DEFAULT_PAD;
    const mode: SequenceMode = options.mode ?? 'gapped';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const rawSeq = Number(
          mode === 'gapless'
            ? await this.allocateGapless(tenantId, docType, year, prefix, tx)
            : await this.allocateGapped(tenantId, docType, year, prefix, tx),
        );
        return {
          number: `${prefix}${year}-${String(rawSeq).padStart(pad, '0')}`,
          rawSeq,
          financialYear: year,
        };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === PG_SERIALIZATION_FAILURE || code === PG_UNIQUE_VIOLATION) {
          if (attempt < MAX_RETRIES) {
            this.logger.warn(
              `sequence collision (${code}) for ${docType}/${year} — retry ${attempt}/${MAX_RETRIES}`,
            );
            continue;
          }
        }
        throw err;
      }
    }

    // Unreachable — loop returns or throws; keeps TS happy.
    throw new Error('Sequence allocation exhausted retries');
  }

  /** Gapped: PG sequence per (tenant, type, year). */
  private async allocateGapped(
    tenantId: string,
    docType: string,
    year: number,
    _prefix: string,
    tx?: PrismaClient,
  ): Promise<bigint> {
    const db = tx ?? (this.prisma as unknown as PrismaClient);
    const seqName = sequenceName(tenantId, docType, year);
    // seqName is a sha256 hex digest (safe identifier) — inline it into the DO
    // block because Prisma's $parameters would otherwise be quoted as literal
    // text inside the dollar-quoted body.
    await db.$queryRawUnsafe(`
      DO $seq$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '${seqName}') THEN
          EXECUTE 'CREATE SEQUENCE "' || '${seqName}' || '"';
        END IF;
      END
      $seq$
    `);
    const [row] = await db.$queryRaw<SequenceRow[]>`
      SELECT nextval(${seqName}::regclass)::bigint AS n
    `;
    if (!row || row.n == null) {
      throw new Error(
        `Sequence allocation returned no row for ${docType}/${year} — is tenant RLS context armed?`,
      );
    }
    return row.n;
  }

  /** Gapless: atomic counter-row increment serializing on the row lock. */
  private async allocateGapless(
    tenantId: string,
    docType: string,
    year: number,
    prefix: string,
    tx?: PrismaClient,
  ): Promise<bigint> {
    const db = tx ?? (this.prisma as unknown as PrismaClient);
    const [row] = await db.$queryRaw<SequenceRow[]>`
      INSERT INTO document_sequences
        (tenant_id, document_type, financial_year, prefix, next_number, updated_at)
      VALUES (${tenantId}::uuid, ${docType}, ${year}, ${prefix}, 2, now())
      ON CONFLICT (tenant_id, document_type, financial_year)
      DO UPDATE SET next_number = document_sequences.next_number + 1,
                    prefix      = EXCLUDED.prefix,
                    updated_at  = now()
      RETURNING (next_number - 1)::bigint AS n
    `;
    if (!row || row.n == null) {
      throw new Error(
        `Gapless sequence allocation returned no row for ${docType}/${year} — ` +
          `document_sequences is RLS-FORCED; the caller must have armed the tenant context`,
      );
    }
    return row.n;
  }

  /** Financial year of a date — calendar year by default (plan §12 rollover). */
  financialYear(date: Date): number {
    return date.getFullYear();
  }
}

/** Deterministic per-(tenant,type,year) sequence name; hex-only, safe identifier. */
function sequenceName(tenantId: string, docType: string, year: number): string {
  const hash = createHash('sha256').update(`${tenantId}:${docType}:${year}`).digest('hex');
  return `seq_doc_${hash.slice(0, 24)}`;
}
