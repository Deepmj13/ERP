import { createHash, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Session } from '../database';

import { JwtSettings } from '../config/configuration';
import { AccessTokenPayload, RefreshTokenPayload } from './auth.types';
import { JWT_SETTINGS } from './auth.constants';

export interface IssueTokensResult {
  accessToken: string;
  refreshToken: string;
  session: {
    id: string;
    familyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
  };
}

export interface SessionStore {
  createSession(data: {
    id: string;
    familyId: string;
    refreshTokenHash: string;
    userId: string;
    tenantId: string;
    device: Prisma.InputJsonValue;
    expiresAt: Date;
  }): Promise<Session>;
  findByHash(hash: string): Promise<Session | null>;
  rotate(hash: string, session: Session): Promise<Session>;
  revokeFamily(familyId: string): Promise<void>;
}

/**
 * Session + token lifecycle (plan §24).
 * Rotation with reuse detection: a session holds the hash of the *current*
 * refresh token. On refresh, a new token is issued and the stored hash
 * advances. A `session` that is signed but fails the hash check has been
 * replayed -> the whole family is revoked.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(JWT_SETTINGS) private readonly settings: JwtSettings,
  ) {}

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  issueTokens(userId: string, tenantId: string, email: string): IssueTokensResult {
    const accessToken = this.jwtService.sign(
      { sub: userId, tid: tenantId, email } satisfies AccessTokenPayload,
      {
        secret: this.settings.accessSecret,
        expiresIn: this.settings.accessExpiresIn,
      },
    );

    const sessionId = randomUUID();
    const familyId = sessionId;
    const refreshPayload: RefreshTokenPayload = { sub: userId, sid: sessionId, tid: tenantId };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.settings.refreshSecret,
      expiresIn: this.settings.refreshExpiresIn,
    });

    const expiresAt = new Date(Date.now() + msFromDuration(this.settings.refreshExpiresIn));

    return {
      accessToken,
      refreshToken,
      session: {
        id: sessionId,
        familyId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
      },
    };
  }

  rotate(refreshToken: string, session: Session, store: SessionStore): Promise<TokensWithHash> {
    return store
      .rotate(session.id, {
        ...session,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
      })
      .then(() => ({ refreshToken, refreshTokenHash: this.hashRefreshToken(refreshToken) }));
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.settings.refreshSecret,
    });
  }
}

export interface TokensWithHash {
  refreshToken: string;
  refreshTokenHash: string;
}

function msFromDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2]) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    default:
      return n * 24 * 60 * 60 * 1000;
  }
}
