import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { TaxRatesService } from './tax-rates.service';

export class CreateTaxRateDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(20) code!: string;
  @IsNumber() @Min(0) @Max(100) rate!: number;
  @IsOptional() @IsBoolean() isInclusive?: boolean;
}

export class UpdateTaxRateDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20) code?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) rate?: number;
  @IsOptional() @IsBoolean() isInclusive?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('tax-rates')
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly service: TaxRatesService) {}

  @Get()
  @RequirePermissions('finance.tax.view')
  @ApiOperation({ summary: 'List tax rates' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('finance.tax.edit')
  @ApiOperation({ summary: 'Create a tax rate' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaxRateDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.tax.edit')
  @ApiOperation({ summary: 'Update a tax rate' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaxRateDto) {
    return this.service.update(user, id, dto);
  }
}
