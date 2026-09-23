import { Body, Controller, Get, Headers, Param, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';

import { Public } from '../../common/decorators/auth.decorators';
import { AdminService, OverrideLimitInput } from './admin.service';

export class OverrideLimitDto {
  @IsString() metric!: string;
  @IsNumber() @Min(-1) value!: number;
}

/**
 * Platform operator endpoints (customer administration, plan §27 Phase 9).
 * @Public — gated by the BILLING_ADMIN_TOKEN header, not tenant RBAC.
 */
@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Post('tenants/:id/override-limit')
  @Public()
  @ApiOperation({ summary: 'Override a plan limit for a tenant (operator token)' })
  overrideLimit(
    @Headers('billing-admin-token') token: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideLimitDto,
  ) {
    this.service.assertOperator(token);
    return this.service.overrideLimit(id, dto as OverrideLimitInput);
  }

  @Get('tenants/:id')
  @Public()
  @ApiOperation({ summary: 'Tenant + subscription + usage summary (operator token)' })
  tenant(
    @Headers('billing-admin-token') token: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.service.assertOperator(token);
    return this.service.tenantSummary(id);
  }

  @Get('usage')
  @Public()
  @ApiOperation({ summary: 'Platform-wide usage summary (operator token)' })
  usage(@Headers('billing-admin-token') token: string | undefined) {
    this.service.assertOperator(token);
    return this.service.usageSummary();
  }
}