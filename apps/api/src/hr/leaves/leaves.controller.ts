import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { LeavesService } from './leaves.service';

export class CreateLeaveDto {
  @IsUUID() employeeId!: string;
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsNumber() @Min(0.5) days?: number;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsUUID() mobileUuid?: string;
}

export class CreateSelfLeaveDto {
  @IsUUID() leaveTypeId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsNumber() @Min(0.5) days?: number;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsUUID() mobileUuid?: string;
}

@ApiTags('leaves')
@Controller('leaves')
export class LeavesController {
  constructor(private readonly service: LeavesService) {}

  @Get()
  @RequirePermissions('hr.leave.view')
  @ApiOperation({ summary: 'List leave requests' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('employee_id') employeeId?: string,
  ) {
    return this.service.list(user, q, status, employeeId);
  }

  @Get('mine')
  @RequirePermissions('hr.leave.self')
  @ApiOperation({ summary: 'List own leave requests (self-service)' })
  listMine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user);
  }

  @Post()
  @RequirePermissions('hr.leave.edit')
  @ApiOperation({ summary: 'Create a leave request (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveDto) {
    return this.service.create(user, dto);
  }

  @Post('mine')
  @RequirePermissions('hr.leave.self')
  @ApiOperation({ summary: 'Create own leave request (self-service, Idempotency-Key required)' })
  createMine(@CurrentUser() user: AuthUser, @Body() dto: CreateSelfLeaveDto) {
    return this.service.createMine(user, dto);
  }

  @Get(':id')
  @RequirePermissions('hr.leave.view')
  @ApiOperation({ summary: 'Get a leave request' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post(':id/submit')
  @RequirePermissions('hr.leave.edit')
  @ApiOperation({ summary: 'Submit a draft leave request' })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.submit(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('hr.leave.approve')
  @ApiOperation({ summary: 'Approve a pending leave request' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/reject')
  @RequirePermissions('hr.leave.approve')
  @ApiOperation({ summary: 'Reject a pending leave request' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reject(user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('hr.leave.edit')
  @ApiOperation({ summary: 'Cancel a draft or pending leave request' })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}