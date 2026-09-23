import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { QuotationsService, QuotationItemInput } from './quotations.service';

export class QuotationItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() discountPct?: number;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateQuotationDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items!: QuotationItemDto[];
}

export class UpdateQuotationDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('quotations')
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Get()
  @RequirePermissions('sales.quote.view')
  @ApiOperation({ summary: 'List quotations' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('sales.quote.view')
  @ApiOperation({ summary: 'Get quotation with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('sales.quote.create')
  @ApiOperation({ summary: 'Create a quotation' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuotationDto) {
    return this.service.create(user, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('sales.quote.edit')
  @ApiOperation({ summary: 'Update a draft quotation' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }

  @Post(':id/submit')
  @RequirePermissions('sales.quote.edit')
  @ApiOperation({ summary: 'Submit quotation for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('sales.quote.approve')
  @ApiOperation({ summary: 'Approve quotation (assigns number)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('sales.quote.approve')
  @ApiOperation({ summary: 'Reject a submitted quotation' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reject(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.quote.cancel')
  @ApiOperation({ summary: 'Cancel a quotation (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  @Post(':id/convert')
  @RequirePermissions('sales.quote.approve')
  @ApiOperation({ summary: 'Convert approved quotation to sales order' })
  convert(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.convert(user, id);
  }
}
