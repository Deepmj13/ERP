import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { VendorPaymentsService } from './vendor-payments.service';

export class VendorPaymentAllocationDto {
  @IsString() vendorBillId!: string;
  @IsNumber() amount!: number;
}

export class CreateVendorPaymentDto {
  @IsString() vendorId!: string;
  @IsOptional() @IsString() bankAccountId?: string;
  @IsNumber() amount!: number;
  @IsString() @MaxLength(20) method!: string;
  @IsOptional() @IsString() @MaxLength(64) reference?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => VendorPaymentAllocationDto) allocations!: VendorPaymentAllocationDto[];
}

export class CaptureVendorPaymentDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => VendorPaymentAllocationDto) allocations!: VendorPaymentAllocationDto[];
}

@ApiTags('vendor-payments')
@Controller('vendor-payments')
export class VendorPaymentsController {
  constructor(private readonly service: VendorPaymentsService) {}

  @Get()
  @RequirePermissions('procurement.payment.view')
  @ApiOperation({ summary: 'List vendor payments' })
  list(@CurrentUser() user: AuthUser, @Query('vendor_id') vendorId?: string) {
    return this.service.list(user, vendorId);
  }

  @Get(':id')
  @RequirePermissions('procurement.payment.view')
  @ApiOperation({ summary: 'Get a vendor payment with allocations' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('procurement.payment.create')
  @ApiOperation({ summary: 'Create a vendor payment (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVendorPaymentDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/capture')
  @RequirePermissions('procurement.payment.capture')
  @ApiOperation({ summary: 'Capture vendor payment (allocation math + number, Idempotency-Key required)' })
  capture(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CaptureVendorPaymentDto) {
    return this.service.capture(user, id, dto);
  }

  @Post(':id/void')
  @RequirePermissions('procurement.payment.capture')
  @ApiOperation({ summary: 'Void a pending vendor payment (nothing allocated)' })
  void(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.voidPayment(user, id);
  }
}