# ADR-0003: API response & error contract

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §17, §16a

## Decision

One contract everywhere:

- Success → `{ data, meta? }`
- Collection → `{ data: [], meta: { page, limit, total } }`
- Error → `{ error: { code, message, details? } }`

Implemented as a global `TransformInterceptor` (envelope) and a global
`AllExceptionsFilter` (error normalization) so controllers cannot drift.

## Context

Multiple modules means multiple authors; a single envelope protects the
Flutter client and keeps the API self-describing.

## Consequences

- Controllers return domain objects; the interceptor wraps them.
- Business errors carry stable machine-readable codes (e.g. `INVOICE_ALREADY_POSTED`);
  unknown exceptions are masked as `INTERNAL_ERROR`.
- Mutating endpoints accept an `Idempotency-Key` header (plan §16a); replays
  return the stored response.
- Envelope types live in `backend/src/contracts`, shared with the Flutter app.
