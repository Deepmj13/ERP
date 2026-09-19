import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { LeaveTypesService } from './leave-types.service';

export class CreateLeaveTypeDto {
  @IsString() @MaxLength(32) code!: string;
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsNumber() @Min(0) entitlementDays?: number;
}

export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsNumber() @Min(0) entitlementDays?: number;
}

@ApiTags('leave-types')
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly service: LeaveTypesService) {}

  @Get()
  @RequirePermissions('hr.leave.view')
  @ApiOperation({ summary: 'List leave types' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.list(user, q);
  }

  @Post()
  @RequirePermissions('hr.leave.edit')
  @ApiOperation({ summary: 'Create a leave type (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveTypeDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('hr.leave.view')
  @ApiOperation({ summary: 'Get a leave type' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('hr.leave.edit')
  @ApiOperation({ summary: 'Update a leave type' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.service.update(user, id, dto);
  }
}