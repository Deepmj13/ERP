import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { SubscriptionService } from './subscription.service';

export class ChangeSubscriptionDto {
  @IsString() planCode!: string;
}

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Get()
  @RequirePermissions('platform.subscription.view')
  @ApiOperation({ summary: 'Current subscription + plan for the workspace' })
  current(@CurrentUser() user: AuthUser) {
    return this.service.current(user);
  }

  @Post('change')
  @RequirePermissions('platform.billing.admin')
  @ApiOperation({ summary: 'Change subscription plan (Idempotency-Key)' })
  change(@CurrentUser() user: AuthUser, @Body() dto: ChangeSubscriptionDto) {
    return this.service.change(user, dto);
  }

  @Post('cancel')
  @RequirePermissions('platform.billing.admin')
  @ApiOperation({ summary: 'Cancel subscription (Idempotency-Key)' })
  cancel(@CurrentUser() user: AuthUser) {
    return this.service.cancel(user);
  }
}