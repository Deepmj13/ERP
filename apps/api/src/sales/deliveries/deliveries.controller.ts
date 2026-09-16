import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { DeliveriesService } from './deliveries.service';

export class DeliveryItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateDeliveryDto {
  @IsString() salesOrderId!: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() deliveryDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items!: DeliveryItemDto[];
}

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly service: DeliveriesService) {}

  @Get()
  @RequirePermissions('sales.delivery.view')
  @ApiOperation({ summary: 'List deliveries' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('sales.delivery.view')
  @ApiOperation({ summary: 'Get delivery with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('sales.delivery.create')
  @ApiOperation({ summary: 'Create a delivery against an approved sales order' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeliveryDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/submit')
  @RequirePermissions('sales.delivery.create')
  @ApiOperation({ summary: 'Submit delivery' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/post')
  @RequirePermissions('sales.delivery.post')
  @ApiOperation({ summary: 'Post delivery (stock-out movements + number)' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }
}