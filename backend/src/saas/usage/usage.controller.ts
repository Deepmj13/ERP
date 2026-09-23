import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { UsageService } from './usage.service';

@ApiTags('usage')
@Controller('usage')
export class UsageController {
  constructor(private readonly service: UsageService) {}

  @Get('limits')
  @RequirePermissions('platform.usage.view')
  @ApiOperation({ summary: 'Plan limits + live counts for the workspace' })
  limits(@CurrentUser() user: AuthUser) {
    return this.service.limits(user);
  }

  @Get('current')
  @RequirePermissions('platform.usage.view')
  @ApiOperation({ summary: 'Latest usage metric readings' })
  current(@CurrentUser() user: AuthUser) {
    return this.service.current(user);
  }
}