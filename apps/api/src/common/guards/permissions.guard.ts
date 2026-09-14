import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthUser } from '../../auth/auth.types';
import { RlsContext } from '../rls/rls-context';

/**
 * Resolves the user's permission codes within the active tenant and checks
 * the route's declared codes. Doesn't check role names — only codes
 * (plan §9 / ADR-0004).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    if (!user) return false;

    // Guards run before the TenantContextInterceptor — arm the RLS context so
    // the user_roles read below (an RLS-enforced table) returns the active
    // tenant's rows instead of nothing.
    return RlsContext.run(user.tenantId, async () => {
      const rows = await this.prisma.userRole.findMany({
        where: { userId: user.userId, tenantId: user.tenantId },
        select: {
          role: {
            select: {
              permissions: { select: { permission: { select: { code: true } } } },
            },
          },
        },
      });

      const granted = new Set(
        rows.flatMap((r) => r.role.permissions.map((p) => p.permission.code)),
      );
      if (required.every((code) => granted.has(code))) {
        return true;
      }
      throw new ForbiddenException(
        `Missing permission: ${required.filter((c) => !granted.has(c)).join(', ')}`,
      );
    });
  }
}
