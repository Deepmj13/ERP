# ADR-0005: Session management — rotated refresh tokens

- Status: Accepted
- Date: 2026-09-13
- Source: ERP_Implementation_Plan_V2.md §24

## Decision

- Access JWT: short TTL (~15 min), stateless.
- Refresh token: long-lived, stored per-platform in secure storage
  (Keychain / Secure Storage) — never SQLite or shared prefs.
- Rotation with **reuse detection**: a reused (already-rotated) token revokes
  the entire session family (same `family_id`).
- Server keeps only a **hash** of the current refresh token per session;
  logout revokes server-side.

## Context

Multi-device desktop + mobile clients make session revocation and theft
detection real requirements, not checkboxes.

## Consequences

- `sessions` table tracks `refresh_token_hash`, `family_id`, device metadata,
  status, `expires_at` (foundation schema).
- The Flutter client refreshes silently in the background and recovers the
  session on app restart from secure storage.
