import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { PurchaseOrdersService } from './purchase-orders.service';

export class PurchaseOrderItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() discountPct?: number;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreatePurchaseOrderDto {
  @IsString() vendorId!: string;
  @IsOptional() @IsString() sourceRequestId?: string;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseOrderItemDto) items!: PurchaseOrderItemDto[];
}

@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions('procurement.order.view')
  @ApiOperation({ summary: 'List purchase orders' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('procurement.order.view')
  @ApiOperation({ summary: 'Get a purchase order with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('procurement.order.create')
  @ApiOperation({ summary: 'Create a purchase order (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.order.edit')
  @ApiOperation({ summary: 'Submit a purchase order for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.order.approve')
  @ApiOperation({ summary: 'Approve a submitted purchase order (assigns number)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.order.edit')
  @ApiOperation({ summary: 'Cancel a purchase order (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}