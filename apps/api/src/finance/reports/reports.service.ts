import { Injectable } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';

interface AccountNetRow {
  account_id: string;
  code: string;
  name: string;
  type: string;
  net: string;
}

interface LedgerRow {
  number: string | null;
  entry_date: Date;
  description: string | null;
  debit: string;
  credit: string;
  narration: string | null;
}

interface LedgerCountRow {
  total: bigint;
}

interface ArAgingRow {
  customer_id: string;
  name: string;
  outstanding: string;
  current: string;
  days_31_60: string;
  days_61_90: string;
  over_90: string;
}

interface TaxSummaryRow {
  tax_rate_id: string | null;
  name: string | null;
  rate: string | null;
  tax_collected: string;
}

/**
 * Financial reports (plan §15, §27 Phase 5): every report is a derived query
 * over journal lines — balances are never stored (Posting rules §5.1). All
 * SQL is parameterized and documented in apps/api/sql/finance.sql. RLS is the
 * backstop; the `tenantId` predicate remains the primary scope.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async trialBalance(user: AuthUser, from?: string, to?: string, accountType?: string) {
    const rows = await this.prisma.$queryRaw<AccountNetRow[]>`
      SELECT a.id AS account_id, a.code, a.name, a.type,
             COALESCE(SUM(l.debit - l.credit), 0)::text AS net
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND j.status = 'POSTED'
        AND (${from}::timestamptz IS NULL OR j.entry_date >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR j.entry_date <= ${to}::timestamptz)
      GROUP BY a.id, a.code, a.name, a.type
      HAVING COALESCE(SUM(l.debit - l.credit), 0) <> 0
      ORDER BY a.code ASC
    `;
    let rowsFiltered = rows;
    if (accountType) rowsFiltered = rows.filter((r) => r.type === accountType);
    const rowsWithBalance = rowsFiltered.map((r) => {
      const net = new Prisma.Decimal(r.net);
      let debit = new Prisma.Decimal(0);
      let credit = new Prisma.Decimal(0);
      if (net.gt(0)) debit = net;
      else credit = net.abs();
      return {
        accountId: r.account_id,
        code: r.code,
        name: r.name,
        type: r.type,
        debit,
        credit,
        balance: net,
      };
    });
    const totalDebit = rowsWithBalance.reduce((acc, r) => acc.add(r.debit), new Prisma.Decimal(0));
    const totalCredit = rowsWithBalance.reduce((acc, r) => acc.add(r.credit), new Prisma.Decimal(0));
    return { rows: rowsWithBalance, totals: { debit: totalDebit, credit: totalCredit } };
  }

  async generalLedger(user: AuthUser, accountId: string, from?: string, to?: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const [countRow] = await this.prisma.$queryRaw<LedgerCountRow[]>`
      SELECT COUNT(*)::bigint AS total
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND l.account_id = ${accountId}::uuid
        AND j.status = 'POSTED'
        AND (${from}::timestamptz IS NULL OR j.entry_date >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR j.entry_date <= ${to}::timestamptz)
    `;
    const rows = await this.prisma.$queryRaw<LedgerRow[]>`
      SELECT j.number, j.entry_date, j.description,
             l.debit::text, l.credit::text, l.narration
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND l.account_id = ${accountId}::uuid
        AND j.status = 'POSTED'
        AND (${from}::timestamptz IS NULL OR j.entry_date >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR j.entry_date <= ${to}::timestamptz)
      ORDER BY j.entry_date ASC, j.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return {
      rows: rows.map((r) => ({
        number: r.number,
        entryDate: r.entry_date,
        description: r.description,
        debit: new Prisma.Decimal(r.debit),
        credit: new Prisma.Decimal(r.credit),
        narration: r.narration,
      })),
      meta: { page, limit, total: Number(countRow?.total ?? 0) },
    };
  }

  async accountsReceivable(user: AuthUser, asOf?: string) {
    const date = asOf ? new Date(asOf) : new Date();
    const rows = await this.prisma.$queryRaw<ArAgingRow[]>`
      SELECT c.id AS customer_id, c.name,
             COALESCE(SUM(i.balance), 0)::text AS outstanding,
             COALESCE(SUM(i.balance)
               FILTER (WHERE (COALESCE(i.due_date, i.issue_date)) >= ${date}::timestamptz),
               0)::text AS current,
             COALESCE(SUM(i.balance)
               FILTER (WHERE (COALESCE(i.due_date, i.issue_date)) < ${date}::timestamptz
                       AND (COALESCE(i.due_date, i.issue_date)) >= ${date}::timestamptz - interval '30 days'),
               0)::text AS days_31_60,
             COALESCE(SUM(i.balance)
               FILTER (WHERE (COALESCE(i.due_date, i.issue_date)) < ${date}::timestamptz - interval '30 days'
                       AND (COALESCE(i.due_date, i.issue_date)) >= ${date}::timestamptz - interval '60 days'),
               0)::text AS days_61_90,
             COALESCE(SUM(i.balance)
               FILTER (WHERE (COALESCE(i.due_date, i.issue_date)) < ${date}::timestamptz - interval '60 days'),
               0)::text AS over_90
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
      WHERE i.tenant_id = ${user.tenantId}::uuid
        AND i.status IN ('POSTED', 'PARTIALLY_PAID')
        AND i.balance > 0
      GROUP BY c.id, c.name
      ORDER BY outstanding DESC
    `;
    return {
      asOf: date,
      rows: rows.map((r) => ({
        customerId: r.customer_id,
        name: r.name,
        outstanding: new Prisma.Decimal(r.outstanding),
        current: new Prisma.Decimal(r.current),
        days31to60: new Prisma.Decimal(r.days_31_60),
        days61to90: new Prisma.Decimal(r.days_61_90),
        over90: new Prisma.Decimal(r.over_90),
      })),
    };
  }

  async accountsPayable(user: AuthUser, asOf?: string) {
    // Vendor bills land in Phase 6; AP balance derives from the AP account
    // (credit side) until then. Kept as a derived query per the ledger rules.
    const date = asOf ? new Date(asOf) : new Date();
    const [row] = await this.prisma.$queryRaw<AccountNetRow[]>`
      SELECT a.id AS account_id, a.code, a.name, a.type,
             COALESCE(SUM(l.credit - l.debit), 0)::text AS net
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND a.code = '2101'
        AND j.status = 'POSTED'
        AND j.entry_date <= ${date}::timestamptz
      GROUP BY a.id, a.code, a.name, a.type
    `;
    const outstanding = row ? new Prisma.Decimal(row.net) : new Prisma.Decimal(0);
    return { asOf: date, outstanding };
  }

  async taxSummary(user: AuthUser, from?: string, to?: string) {
    const rows = await this.prisma.$queryRaw<TaxSummaryRow[]>`
      SELECT tr.id AS tax_rate_id, tr.name, tr.rate::text,
             COALESCE(SUM(ii.tax_amount), 0)::text AS tax_collected
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id AND i.tenant_id = ii.tenant_id
      LEFT JOIN tax_rates tr ON tr.id = ii.tax_rate_id AND tr.tenant_id = ii.tenant_id
      WHERE ii.tenant_id = ${user.tenantId}::uuid
        AND i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
        AND (${from}::timestamptz IS NULL OR i.issue_date >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR i.issue_date <= ${to}::timestamptz)
      GROUP BY tr.id, tr.name, tr.rate
      ORDER BY tr.rate DESC
    `;
    return rows.map((r) => ({
      taxRateId: r.tax_rate_id,
      name: r.name,
      rate: r.rate !== null ? new Prisma.Decimal(r.rate) : null,
      taxCollected: new Prisma.Decimal(r.tax_collected),
    }));
  }

  async incomeStatement(user: AuthUser, from?: string, to?: string) {
    const rows = await this.prisma.$queryRaw<AccountNetRow[]>`
      SELECT a.id AS account_id, a.code, a.name, a.type,
             COALESCE(SUM(CASE
               WHEN a.type = 'REVENUE' THEN l.credit - l.debit
               WHEN a.type = 'EXPENSE' THEN l.debit - l.credit
               ELSE 0 END), 0)::text AS net
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND j.status = 'POSTED'
        AND a.type IN ('REVENUE', 'EXPENSE')
        AND (${from}::timestamptz IS NULL OR j.entry_date >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR j.entry_date <= ${to}::timestamptz)
      GROUP BY a.id, a.code, a.name, a.type
      ORDER BY a.code ASC
    `;
    const revenue = rows
      .filter((r) => r.type === 'REVENUE')
      .map((r) => ({ accountId: r.account_id, code: r.code, name: r.name, amount: new Prisma.Decimal(r.net) }));
    const expenses = rows
      .filter((r) => r.type === 'EXPENSE')
      .map((r) => ({ accountId: r.account_id, code: r.code, name: r.name, amount: new Prisma.Decimal(r.net) }));
    const totalRevenue = revenue.reduce((acc, r) => acc.add(r.amount), new Prisma.Decimal(0));
    const totalExpenses = expenses.reduce((acc, r) => acc.add(r.amount), new Prisma.Decimal(0));
    return {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue.sub(totalExpenses),
    };
  }

  async balanceSheet(user: AuthUser, asOf?: string) {
    const date = asOf ? new Date(asOf) : new Date();
    const rows = await this.prisma.$queryRaw<AccountNetRow[]>`
      SELECT a.id AS account_id, a.code, a.name, a.type,
             COALESCE(SUM(l.debit - l.credit), 0)::text AS net
      FROM journal_entry_lines l
      JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
      JOIN accounts a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
      WHERE l.tenant_id = ${user.tenantId}::uuid
        AND j.status = 'POSTED'
        AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
        AND j.entry_date <= ${date}::timestamptz
      GROUP BY a.id, a.code, a.name, a.type
      ORDER BY a.code ASC
    `;
    const ts = await this.incomeStatement(user, undefined, asOf);
    const accounts = rows.map((r) => {
      const net = new Prisma.Decimal(r.net);
      const signed = r.type === 'ASSET' ? net : net.negated();
      return { accountId: r.account_id, code: r.code, name: r.name, type: r.type, balance: signed };
    });
    const totalAssets = accounts
      .filter((a) => a.type === 'ASSET')
      .reduce((acc, a) => acc.add(a.balance), new Prisma.Decimal(0));
    const totalLiabilities = accounts
      .filter((a) => a.type === 'LIABILITY')
      .reduce((acc, a) => acc.add(a.balance), new Prisma.Decimal(0));
    const totalEquity = accounts
      .filter((a) => a.type === 'EQUITY')
      .reduce((acc, a) => acc.add(a.balance), new Prisma.Decimal(0));
    return {
      asOf: date,
      accounts,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity.add(ts.netIncome),
        retainedEarnings: ts.netIncome,
      },
    };
  }
}