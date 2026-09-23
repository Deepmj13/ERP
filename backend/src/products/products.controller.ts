import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ProductType } from '../database';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { ProductsService } from './products.service';

export class CreateProductDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsIn(['GOOD', 'SERVICE']) type?: ProductType;
  @IsString() @MaxLength(255) name!: string;
  @IsString() @MaxLength(64) sku!: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() unitId?: string | null;
  @IsOptional() @IsString() taxRateId?: string | null;
  @IsOptional() @IsIn(['GOOD', 'SERVICE']) type?: ProductType;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(64) sku?: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) salePrice?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @RequirePermissions('inventory.product.view')
  @ApiOperation({ summary: 'List products (optional ?q= name filter)' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.list(user, q);
  }

  @Post()
  @RequirePermissions('inventory.product.edit')
  @ApiOperation({ summary: 'Create a product' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('inventory.product.view')
  @ApiOperation({ summary: 'Get a product with category/unit/tax rate' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.product.edit')
  @ApiOperation({ summary: 'Update a product' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(user, id, dto);
  }
}
