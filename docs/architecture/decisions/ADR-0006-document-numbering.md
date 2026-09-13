# ADR-0006: Document numbering concurrency

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §12, §16a

## Decision

- **Default:** PostgreSQL sequence per `(tenant, document_type, financial_year)`
  plus a `UNIQUE` constraint on the final `document_number`. Gaps allowed.
- **Gapless (statutory/tax):** counter row in `document_sequences` updated
  with `SELECT … FOR UPDATE` inside the same transaction.
- Numbers are assigned at **post/issue** time, never on draft creation.
- Allocation retries on `40001` / `23505` collisions.

## Context

Duplicate document numbers are a correctness failure under concurrent posting.

## Consequences

- `document_sequences` is a mandatory schema deliverable (plan §31).
- Sequence allocation lives in raw SQL (see ADR-0001) and is unit-tested for
  parallelism.
- Pending documents may be renumbered; the audit log records number changes.
