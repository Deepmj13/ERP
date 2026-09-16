import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { OrdersService } from './orders.service';

export class OrderItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() discountPct?: number;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateSalesOrderDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}

export class UpdateSalesOrderDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('sales-orders')
@Controller('sales-orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get()
  @RequirePermissions('sales.order.view')
  @ApiOperation({ summary: 'List sales orders' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('sales.order.view')
  @ApiOperation({ summary: 'Get sales order with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('sales.order.create')
  @ApiOperation({ summary: 'Create a sales order' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalesOrderDto) {
    return this.service.create(user, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('sales.order.edit')
  @ApiOperation({ summary: 'Update a draft sales order' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }

  @Post(':id/submit')
  @RequirePermissions('sales.order.edit')
  @ApiOperation({ summary: 'Submit sales order for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('sales.order.approve')
  @ApiOperation({ summary: 'Approve sales order (assigns number)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.order.cancel')
  @ApiOperation({ summary: 'Cancel a sales order (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}