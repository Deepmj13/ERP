import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { PermissionsService, PermissionGroup } from './permissions.service';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get()
  @RequirePermissions('org.role.view')
  @ApiOperation({ summary: 'Permission catalog grouped by domain' })
  catalog(@CurrentUser() user: AuthUser): Promise<PermissionGroup[]> {
    return this.service.catalog(user);
  }
}
