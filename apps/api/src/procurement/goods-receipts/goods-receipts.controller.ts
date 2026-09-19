import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { GoodsReceiptsService } from './goods-receipts.service';

export class GoodsReceiptItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsNumber() unitCost?: number;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateGoodsReceiptDto {
  @IsString() purchaseOrderId!: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() receiptDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GoodsReceiptItemDto) items!: GoodsReceiptItemDto[];
}

@ApiTags('goods-receipts')
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly service: GoodsReceiptsService) {}

  @Get()
  @RequirePermissions('procurement.grn.view')
  @ApiOperation({ summary: 'List goods receipts' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('procurement.grn.view')
  @ApiOperation({ summary: 'Get a goods receipt with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('procurement.grn.create')
  @ApiOperation({ summary: 'Create a goods receipt against a purchase order (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGoodsReceiptDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/post')
  @RequirePermissions('procurement.grn.post')
  @ApiOperation({ summary: 'Post goods receipt (stock-in movements, assigns number)' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }
}