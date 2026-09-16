import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { InvoicesService } from './invoices.service';

export class InvoiceItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsNumber() discountPct?: number;
  @IsOptional() @IsString() taxRateId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateInvoiceDto {
  @IsString() customerId!: string;
  @IsOptional() @IsString() salesOrderId?: string;
  @IsOptional() @IsString() deliveryId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsString() issueDate!: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceItemDto) items!: InvoiceItemDto[];
}

export class UpdateInvoiceDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() salesOrderId?: string;
  @IsOptional() @IsString() deliveryId?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  @RequirePermissions('sales.invoice.view')
  @ApiOperation({ summary: 'List invoices' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('customer_id') customerId?: string,
  ) {
    return this.service.list(user, q, status, customerId);
  }

  @Get(':id')
  @RequirePermissions('sales.invoice.view')
  @ApiOperation({ summary: 'Get invoice with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('sales.invoice.create')
  @ApiOperation({ summary: 'Create an invoice' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInvoiceDto) {
    return this.service.create(user, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('sales.invoice.edit')
  @ApiOperation({ summary: 'Update a draft invoice' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }

  @Post(':id/submit')
  @RequirePermissions('sales.invoice.edit')
  @ApiOperation({ summary: 'Submit invoice for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('sales.invoice.approve')
  @ApiOperation({ summary: 'Approve a submitted invoice' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/post')
  @RequirePermissions('sales.invoice.post')
  @ApiOperation({ summary: 'Post invoice (assigns gapless number)' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.invoice.cancel')
  @ApiOperation({ summary: 'Cancel an invoice (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }

  @Post(':id/pdf')
  @RequirePermissions('sales.invoice.post')
  @ApiOperation({ summary: 'Queue invoice PDF generation' })
  pdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.queuePdf(user, user.tenantId, id);
  }
}