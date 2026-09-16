import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { StockService } from './stock.service';

export class AdjustStockDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsOptional() @IsNumber() unitCost?: number;
}

export class TransferLineDto {
  @IsString() productId!: string;
  @IsString() fromWarehouseId!: string;
  @IsString() toWarehouseId!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

export class TransferStockDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class StocktakeDto {
  @IsString() warehouseId!: string;
  @IsString() productId!: string;
  @IsNumber() counted!: number;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
}

@ApiTags('stock')
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get()
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ summary: 'Stock balances (on-hand / available)' })
  listBalances(
    @CurrentUser() user: AuthUser,
    @Query('warehouse') warehouseId?: string,
    @Query('product') productId?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listBalances(user, warehouseId, productId, q);
  }

  @Get('movements')
  @RequirePermissions('inventory.stock.movement.view')
  @ApiOperation({ summary: 'Stock movements ledger (auditable)' })
  listMovements(
    @CurrentUser() user: AuthUser,
    @Query('product') productId?: string,
    @Query('warehouse') warehouseId?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listMovements(user, { productId, warehouseId, type, from, to });
  }

  @Get('on-hand/low')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ summary: 'Low-stock list' })
  listLow(@CurrentUser() user: AuthUser, @Query('threshold') threshold?: string) {
    return this.service.listLowStock(user, threshold ? Number(threshold) : undefined);
  }

  @Get('serial-numbers')
  @RequirePermissions('inventory.serial.view')
  @ApiOperation({ summary: 'Serial numbers' })
  listSerials(
    @CurrentUser() user: AuthUser,
    @Query('product') productId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listSerials(user, productId, status);
  }

  @Get('batches')
  @RequirePermissions('inventory.batch.view')
  @ApiOperation({ summary: 'Batches' })
  listBatches(@CurrentUser() user: AuthUser, @Query('product') productId?: string) {
    return this.service.listBatches(user, productId);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Adjust stock (signed delta)' })
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    return this.service.adjust(user, dto);
  }

  @Post('transfers')
  @RequirePermissions('inventory.stock.transfer')
  @ApiOperation({ summary: 'Transfer stock between warehouses (net zero)' })
  transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferStockDto) {
    return this.service.transfer(user, dto.lines);
  }

  @Post('takes')
  @RequirePermissions('inventory.stock.adjust')
  @ApiOperation({ summary: 'Stocktake — adjust stock to physical count' })
  stocktake(@CurrentUser() user: AuthUser, @Body() dto: StocktakeDto) {
    return this.service.stocktake(user, dto);
  }
}
