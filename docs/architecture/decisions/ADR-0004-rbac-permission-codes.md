# ADR-0004: RBAC — permission codes over hard-coded roles

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §9

## Decision

Authorization uses **permission codes** (e.g. `sales.quote.approve`) granted to
tenant-scoped roles. Code never checks role names; it checks permission codes.

## Context

Hard-coded roles couple business rules to role names, and role renames/merges
become logic changes. Permission codes are granular, stable, and a seedable
reference set.

## Consequences

- `permissions` is a global reference table; `roles` and `role_permissions`
  are tenant-scoped.
- The base permission set ships as a seed (`database/prisma/seed.ts`).
- Hiding a Flutter button is presentation only — the API enforces the code
  server-side.
- Authorization derives the tenant + user membership + role → permissions
  from the authenticated session, never from the client.
