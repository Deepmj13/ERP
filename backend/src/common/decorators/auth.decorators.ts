import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as reachable without authentication (register/login/refresh). */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Injects the authenticated user (set by JwtAuthGuard) into a parameter:
 *   async method(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export type { AuthUser };
