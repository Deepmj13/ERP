import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { PurchaseRequestsService } from './purchase-requests.service';

export class PurchaseRequestItemDto {
  @IsOptional() @IsString() productId?: string;
  @IsString() description!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsString() expectedDate?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreatePurchaseRequestDto {
  @IsOptional() @IsString() requestedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseRequestItemDto) items!: PurchaseRequestItemDto[];
}

@ApiTags('purchase-requests')
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Get()
  @RequirePermissions('procurement.request.view')
  @ApiOperation({ summary: 'List purchase requests' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('procurement.request.view')
  @ApiOperation({ summary: 'Get a purchase request with items' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('procurement.request.create')
  @ApiOperation({ summary: 'Create a purchase request (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseRequestDto) {
    return this.service.create(user, dto as never);
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.request.edit')
  @ApiOperation({ summary: 'Submit a purchase request for approval' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('procurement.request.approve')
  @ApiOperation({ summary: 'Approve a submitted purchase request (assigns number)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.request.edit')
  @ApiOperation({ summary: 'Cancel a purchase request (DRAFT/SUBMITTED only)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}