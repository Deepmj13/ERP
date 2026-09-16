import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { PaymentsService } from './payments.service';

export class PaymentAllocationDto {
  @IsString() invoiceId!: string;
  @IsNumber() amount!: number;
}

export class CreatePaymentDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsNumber() amount!: number;
  @IsString() @MaxLength(20) method!: string;
  @IsOptional() @IsString() @MaxLength(64) reference?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) allocations!: PaymentAllocationDto[];
}

export class CapturePaymentDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentAllocationDto) allocations!: PaymentAllocationDto[];
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @RequirePermissions('sales.payment.view')
  @ApiOperation({ summary: 'List payments' })
  list(@CurrentUser() user: AuthUser, @Query('customer_id') customerId?: string) {
    return this.service.list(user, customerId);
  }

  @Get(':id')
  @RequirePermissions('sales.payment.view')
  @ApiOperation({ summary: 'Get a payment with allocations' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('sales.payment.create')
  @ApiOperation({ summary: 'Create a payment (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/capture')
  @RequirePermissions('sales.payment.capture')
  @ApiOperation({ summary: 'Capture payment (allocation math + number, Idempotency-Key required)' })
  capture(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CapturePaymentDto) {
    return this.service.capture(user, id, dto);
  }

  @Post(':id/void')
  @RequirePermissions('sales.payment.void')
  @ApiOperation({ summary: 'Void a pending payment (single tx, nothing allocated)' })
  void(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.voidPayment(user, id);
  }
}