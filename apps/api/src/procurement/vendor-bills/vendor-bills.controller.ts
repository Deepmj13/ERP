import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { VendorBillsService } from './vendor-bills.service';

export class VendorBillItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() discountPct?: number;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateVendorBillDto {
  @IsString() vendorId!: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() goodsReceiptId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsString() issueDate!: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => VendorBillItemDto) items!: VendorBillItemDto[];
}

@ApiTags('vendor-bills')
@Controller('vendor-bills')
export class VendorBillsController {
  constructor(private readonly service: VendorBillsService) {}

  @Get()
  @RequirePermissions('procurement.bill.view')
  @ApiOperation({ summary: 'List vendor bills' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('vendor_id') vendorId?: string,
  ) {
    return this.service.list(user, q, status, vendorId);
  }

  @Get(':id')
  @RequirePermissions('procurement.bill.view')
  @ApiOperation({ summary: 'Get a vendor bill with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('procurement.bill.create')
  @ApiOperation({ summary: 'Create a vendor bill (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVendorBillDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.bill.create')
  @ApiOperation({ summary: 'Submit a vendor bill for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.bill.approve')
  @ApiOperation({ summary: 'Approve a submitted vendor bill' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/post')
  @RequirePermissions('procurement.bill.post')
  @ApiOperation({ summary: 'Post vendor bill (assigns gapless number + AP entry)' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.bill.create')
  @ApiOperation({ summary: 'Cancel a vendor bill (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}