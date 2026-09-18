-- ---------------------------------------------------------------------------
-- Finance (Phase 5) report queries — plan §15 posting rules
--
-- Ledger balances are DERIVED from journal_entry_lines, never stored
-- (rule: "Ledger balances computed from journal lines; never stored").
-- Reports live as raw, parameterized SQL in apps/api/src/finance/reports/ —
-- the SQL below documents the canonical shapes. All queries are scoped by
-- tenant_id (primary) and rely on RLS ENABLE+FORCE as the backstop, exactly
-- like stock.sql / document_sequences.sql.
-- ---------------------------------------------------------------------------

-- TRIAL BALANCE -------------------------------------------------------------
-- Net = SUM(debit) − SUM(credit) per account over posted entries in range.
--   debit side: net > 0; credit side: net < 0. Totals must always balance.
SELECT a.id                                 AS account_id,
       a.code, a.name, a.type,
       COALESCE(SUM(l.debit - l.credit), 0) AS net
FROM journal_entry_lines l
JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
JOIN accounts        a ON a.id = l.account_id  AND a.tenant_id = l.tenant_id
WHERE l.tenant_id = :tenant_id
  AND j.status = 'POSTED'
  AND (cast(:from AS timestamptz) IS NULL OR j.entry_date >= cast(:from AS timestamptz))
  AND (cast(:to   AS timestamptz) IS NULL OR j.entry_date <= cast(:to   AS timestamptz))
GROUP BY a.id, a.code, a.name, a.type
HAVING COALESCE(SUM(l.debit - l.credit), 0) <> 0
ORDER BY a.code;

-- GENERAL LEDGER ------------------------------------------------------------
-- Paginated lines for one account with the count for meta.total. The running
-- balance is computed client-side over the page (window over an OFFSET page
-- would be ambiguous).
SELECT j.number, j.entry_date, j.description,
       l.debit::text, l.credit::text, l.narration
FROM journal_entry_lines l
JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
WHERE l.tenant_id     = :tenant_id
  AND l.account_id    = :account_id
  AND j.status = 'POSTED'
  AND (cast(:from AS timestamptz) IS NULL OR j.entry_date >= cast(:from AS timestamptz))
  AND (cast(:to   AS timestamptz) IS NULL OR j.entry_date <= cast(:to   AS timestamptz))
ORDER BY j.entry_date ASC, j.created_at ASC
LIMIT :limit OFFSET :offset;

-- ACCOUNTS RECEIVABLE (aged) ------------------------------------------------
-- Outstanding balance per customer bucketed by due date vs :as_of. Grouped so
-- each customer is one row; the FILTER clauses are evaluated per invoice.
SELECT c.id AS customer_id, c.name,
       COALESCE(SUM(i.balance), 0) AS outstanding,
       COALESCE(SUM(i.balance) FILTER (
         WHERE COALESCE(i.due_date, i.issue_date) >= :as_of), 0) AS current,
       COALESCE(SUM(i.balance) FILTER (
         WHERE COALESCE(i.due_date, i.issue_date) <  :as_of
           AND COALESCE(i.due_date, i.issue_date) >= :as_of - interval '30 days'), 0) AS days_31_60,
       COALESCE(SUM(i.balance) FILTER (
         WHERE COALESCE(i.due_date, i.issue_date) <  :as_of - interval '30 days'
           AND COALESCE(i.due_date, i.issue_date) >= :as_of - interval '60 days'), 0) AS days_61_90,
       COALESCE(SUM(i.balance) FILTER (
         WHERE COALESCE(i.due_date, i.issue_date) <  :as_of - interval '60 days'), 0) AS over_90
FROM invoices i
JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
WHERE i.tenant_id = :tenant_id
  AND i.status IN ('POSTED', 'PARTIALLY_PAID')
  AND i.balance > 0
GROUP BY c.id, c.name;

-- ACCOUNTS PAYABLE ----------------------------------------------------------
-- Derived from the AP account (2101); vendor bills arrive with Phase 6.
SELECT a.id, a.code, a.name,
       COALESCE(SUM(l.credit - l.debit), 0) AS outstanding
FROM journal_entry_lines l
JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
JOIN accounts        a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
WHERE l.tenant_id = :tenant_id AND a.code = '2101'
  AND j.status = 'POSTED'
  AND j.entry_date <= :as_of
GROUP BY a.id, a.code, a.name;

-- TAX SUMMARY -----------------------------------------------------------------
-- Output tax collected per rate, derived from posted invoice items.
SELECT tr.id, tr.name, tr.rate,
       COALESCE(SUM(ii.tax_amount), 0) AS tax_collected
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id AND i.tenant_id = ii.tenant_id
LEFT JOIN tax_rates tr ON tr.id = ii.tax_rate_id AND tr.tenant_id = ii.tenant_id
WHERE ii.tenant_id = :tenant_id
  AND i.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID')
  AND (cast(:from AS timestamptz) IS NULL OR i.issue_date >= cast(:from AS timestamptz))
  AND (cast(:to   AS timestamptz) IS NULL OR i.issue_date <= cast(:to   AS timestamptz))
GROUP BY tr.id, tr.name, tr.rate;

-- INCOME STATEMENT ------------------------------------------------------------
-- Revenue is credit-normal, expense is debit-normal; net per account.
SELECT a.code, a.name, a.type,
       SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit - l.debit
                WHEN a.type = 'EXPENSE' THEN l.debit - l.credit
                ELSE 0 END) AS net
FROM journal_entry_lines l
JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
JOIN accounts        a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
WHERE l.tenant_id = :tenant_id AND j.status = 'POSTED'
  AND a.type IN ('REVENUE', 'EXPENSE')
  AND (cast(:from AS timestamptz) IS NULL OR j.entry_date >= cast(:from AS timestamptz))
  AND (cast(:to   AS timestamptz) IS NULL OR j.entry_date <= cast(:to   AS timestamptz))
GROUP BY a.code, a.name, a.type;

-- BALANCE SHEET -----------------------------------------------------------------
-- Asset is debit-normal; liability/equity are shown as negative debit-net and
-- signed in the service. Retained earnings = income statement net over entries
-- up to :as_of (computed in the service).
SELECT a.code, a.name, a.type,
       COALESCE(SUM(l.debit - l.credit), 0) AS net
FROM journal_entry_lines l
JOIN journal_entries j ON j.id = l.journal_entry_id AND j.tenant_id = l.tenant_id
JOIN accounts        a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
WHERE l.tenant_id = :tenant_id AND j.status = 'POSTED'
  AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
  AND j.entry_date <= :as_of
GROUP BY a.code, a.name, a.type;

-- AUTO-POSTING (plan §15) ------------------------------------------------------
-- Invoice.post(): AR / Revenue / Output Tax — the source-of-truth shapes.
--   DR accounts_receivable (1103)   = invoice.total
--   CR sales_revenue (4101)         = invoice.subtotal - discount_total
--   CR output_tax_payable (2102)    = invoice.tax_total
-- Payment.capture(): Bank / AR — allocations only (unallocated funds stay out
-- of the ledger until allocated).
--   DR bank (1102, or bank_account.account_id) = SUM(payment_allocations.amount)
--   CR accounts_receivable (1103)              = SUM(payment_allocations.amount)
-- Each writes ONE JournalEntry (status POSTED, number JE-YYYY-NNNNNN via G-1,
-- reference INVOICE/PAYMENT + id) in the SAME transaction as the document
-- status change — never an orphan operational document.