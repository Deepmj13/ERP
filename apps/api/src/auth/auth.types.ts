import type { Request } from 'express';

/** Claims carried by the short-lived access JWT (plan §24). */
export interface AccessTokenPayload {
  /** user id */
  sub: string;
  /** active tenant id */
  tid: string;
  email: string;
}

/** Claims carried by the refresh token — includes session (family) id. */
export interface RefreshTokenPayload {
  sub: string;
  /** session / family id */
  sid: string;
  tid: string;
}

/** Authenticated context attached to requests by the JWT guard. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
}

/** Shape returned by auth endpoints (register/login/refresh/switch). */
export interface AuthContext {
  accessToken: string;
  refreshToken: string;
  tenant: { id: string; name: string; slug: string };
  company?: { id: string; name: string };
  user: { id: string; email: string; name: string };
  expiresAt: string;
}

export type AuthedRequest = Request & { user: AuthUser };
