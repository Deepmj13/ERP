import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permission codes a route requires, e.g.
 *   @RequirePermissions('sales.quote.approve')
 * Enforced server-side by PermissionsGuard (plan §9) — never the client.
 */
export const RequirePermissions = (...codes: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSIONS_KEY, codes);
