import { ForbiddenException } from '@nestjs/common';
import { RlsContext, RlsContextState } from '../rls/rls-context';
import { PermissionsGuard } from './permissions.guard';
import { AuthUser } from '../../auth/auth.types';

interface UserRoleRow {
  role: { permissions: Array<{ permission: { code: string } }> };
}

function build(required: string[], rows: UserRoleRow[], user?: AuthUser) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as any;
  let seenContext: RlsContextState | undefined;
  const prisma = {
    userRole: {
      findMany: jest.fn(async () => {
        seenContext = RlsContext.get();
        return rows;
      }),
    },
  } as any;
  const guard = new PermissionsGuard(reflector, prisma);
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: user ?? { userId: 'u1', tenantId: 't1', email: 'a@b.c' },
      }),
    }),
  } as any;
  return {
    guard,
    context,
    prisma: prisma as { userRole: { findMany: jest.Mock } },
    seen: () => seenContext,
  };
}

describe('PermissionsGuard (ADR-0002 guard arming)', () => {
  it('arms the RLS context to the user tenant while reading user_roles', async () => {
    const { guard, context, seen } = build(
      ['org.role.view'],
      [{ role: { permissions: [{ permission: { code: 'org.role.view' } }] } }],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(seen()).toEqual({ tenantId: 't1', inTx: false });
  });

  it('grants when all required permission codes are present', async () => {
    const { guard, context } = build(
      ['org.role.view', 'org.user.invite'],
      [
        {
          role: {
            permissions: [
              { permission: { code: 'org.role.view' } },
              { permission: { code: 'org.user.invite' } },
            ],
          },
        },
      ],
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('forbids with the missing codes when a required permission is absent', async () => {
    const { guard, context } = build(
      ['org.role.view', 'org.role.edit'],
      [{ role: { permissions: [{ permission: { code: 'org.role.view' } }] } }],
    );

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/org\.role\.edit/);
  });

  it('denies when no authenticated user is present', async () => {
    const { guard, context } = build(['org.role.view'], [], undefined as any);
    context.switchToHttp = () => ({ getRequest: () => ({ user: undefined }) }) as any;

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });
});
