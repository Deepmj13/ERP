import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { BillingService } from './billing.service';

export class CheckoutDto {
  @IsString() planCode!: string;
  @IsOptional() @IsIn(['MONTHLY', 'YEARLY']) interval?: string;
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Post('checkout-session')
  @RequirePermissions('platform.billing.admin')
  @ApiOperation({ summary: 'Start a checkout session for a plan change (Idempotency-Key)' })
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.service.checkout(user, dto);
  }

  @Get('sessions')
  @RequirePermissions('platform.billing.admin')
  @ApiOperation({ summary: 'Latest checkout sessions for this workspace' })
  sessions(@CurrentUser() user: AuthUser) {
    return this.service.latestCheckoutSession(user);
  }

  /**
   * Provider webhook (plan §27 Phase 9). Public — the provider cannot hold a
   * tenant JWT. Signature + payload are captured and handled by the worker
   * (BillingProcessor), keeping provider verification behind the job boundary.
   */
  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Billing provider webhook (signature-verified in worker)' })
  webhook(
    @Headers('billing-provider') provider: string | undefined,
    @Headers('billing-signature') signature: string | undefined,
    @Body() raw: Record<string, unknown>,
  ) {
    return this.service.webhook({
      provider: provider ?? 'mock',
      signature,
      raw,
    });
  }
}