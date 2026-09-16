import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { WarehousesService } from './warehouses.service';

export class CreateWarehouseDto {
  @IsString() @MaxLength(32) code!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown> | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('warehouses')
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  @RequirePermissions('inventory.warehouse.view')
  @ApiOperation({ summary: 'List warehouses' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.list(user, q);
  }

  @Get(':id')
  @RequirePermissions('inventory.warehouse.view')
  @ApiOperation({ summary: 'Get a warehouse' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('inventory.warehouse.edit')
  @ApiOperation({ summary: 'Create a warehouse' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWarehouseDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.warehouse.edit')
  @ApiOperation({ summary: 'Update a warehouse' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }
}
