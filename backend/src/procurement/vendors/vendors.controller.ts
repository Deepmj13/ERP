import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { VendorsService } from './vendors.service';

export class CreateVendorDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(32) paymentTerms?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(32) paymentTerms?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly service: VendorsService) {}

  @Get()
  @RequirePermissions('procurement.vendor.view')
  @ApiOperation({ summary: 'List vendors' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('is_active') isActive?: string) {
    return this.service.list(user, q, isActive);
  }

  @Post()
  @RequirePermissions('procurement.vendor.edit')
  @ApiOperation({ summary: 'Create a vendor (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVendorDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('procurement.vendor.view')
  @ApiOperation({ summary: 'Get a vendor' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('procurement.vendor.edit')
  @ApiOperation({ summary: 'Update a vendor' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.service.update(user, id, dto);
  }
}