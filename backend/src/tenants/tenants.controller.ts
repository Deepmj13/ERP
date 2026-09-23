import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { TenantsService, MembershipView } from './tenants.service';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'List the user memberships' })
  list(@CurrentUser() user: AuthUser): Promise<MembershipView[]> {
    return this.service.listForUser(user);
  }

  @Post(':tenantId/activate')
  @ApiOperation({ summary: 'Switch active tenant (explicit business action)' })
  activate(
    @CurrentUser() user: AuthUser,
    @Param('tenantId') tenantId: string,
    @Req() req: Request,
  ) {
    const agent = req.headers['user-agent'];
    return this.service.activate(
      user,
      tenantId,
      typeof agent === 'string' ? agent.slice(0, 255) : undefined,
    );
  }
}
