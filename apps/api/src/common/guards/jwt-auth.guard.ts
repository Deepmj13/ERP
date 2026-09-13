import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload, AuthUser } from '../../auth/auth.types';
import { JWT_SETTINGS } from '../../auth/auth.constants';
import { JwtSettings } from '../../config/configuration';
import { IS_PUBLIC_KEY } from '../../common/decorators/auth.decorators';

/**
 * Validates the access JWT and verifies the user is an active member of the
 * tenant claimed in the token. The tenant context therefore always derives
 * from server state (rule §2.3) — never from a client-supplied parameter.
 * Routes annotated with @Public() skip authentication entirely.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Inject(JWT_SETTINGS) private readonly settings: JwtSettings,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<Boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers['authorization'];
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.settings.accessSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId: payload.tid, userId: payload.sub } },
    });
    if (!membership || membership.status !== 'ACTIVE') {
      throw new UnauthorizedException('Not a member of the active tenant');
    }

    const user: AuthUser = { userId: payload.sub, tenantId: payload.tid, email: payload.email };
    request.user = user;
    return true;
  }
}
