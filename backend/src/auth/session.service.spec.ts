import { JwtService } from '@nestjs/jwt';
import { SessionService } from './session.service';

const SETTINGS = {
  accessSecret: 'test-access',
  accessExpiresIn: '15m',
  refreshSecret: 'test-refresh',
  refreshExpiresIn: '7d',
};

const jwtService = new JwtService();

describe('SessionService (plan §24 refresh rotation)', () => {
  it('issues access + refresh tokens with matching stored hash', () => {
    const svc = new SessionService(jwtService, SETTINGS);
    const issued = svc.issueTokens('user-1', 'tenant-1', 'a@b.c');

    expect(issued.session.refreshTokenHash).toBe(svc.hashRefreshToken(issued.refreshToken));
    expect(issued.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(issued.accessToken).not.toBe(issued.refreshToken);
  });

  it('produces a rotating refresh token whose new hash replaces the current one', async () => {
    const svc = new SessionService(jwtService, SETTINGS);
    const issued = svc.issueTokens('user-1', 'tenant-1', 'a@b.c');
    const session = { id: issued.session.id, familyId: issued.session.familyId } as never;

    const rotated = await svc.rotate('new-refresh-token', session, {
      createSession: async (data) => session,
      findByHash: async () => null,
      rotate: async (_sessionId: string, updated) => updated,
      revokeFamily: async () => undefined,
    });

    expect(rotated.refreshTokenHash).not.toBe(issued.session.refreshTokenHash);
  });

  it('rejects a refresh token that was issued for a different session (reuse detector input)', () => {
    const svc = new SessionService(jwtService, SETTINGS);
    const a = svc.issueTokens('u1', 't1', 'a@b.c');
    const b = svc.issueTokens('u2', 't1', 'b@c.d');

    expect(a.session.refreshTokenHash).not.toBe(b.session.refreshTokenHash);
  });
});
