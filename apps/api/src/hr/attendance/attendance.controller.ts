import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { AttendanceService } from './attendance.service';

export class CreateAttendanceDto {
  @IsUUID() employeeId!: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsString() @MaxLength(16) status?: string;
  @IsOptional() @IsUUID() mobileUuid?: string;
}

export class PunchDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsDateString() workDate!: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
}

@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  @RequirePermissions('hr.attendance.view')
  @ApiOperation({ summary: 'List attendance records' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(user, q, from, to, status);
  }

  @Post()
  @RequirePermissions('hr.attendance.edit')
  @ApiOperation({ summary: 'Create an attendance record (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAttendanceDto) {
    return this.service.create(user, dto);
  }

  @Post('punch')
  @RequirePermissions('hr.attendance.edit')
  @ApiOperation({ summary: 'Punch in/out (upserts the employee+workDate row, Idempotency-Key required)' })
  punch(@CurrentUser() user: AuthUser, @Body() dto: PunchDto) {
    return this.service.punch(user, dto);
  }

  @Get(':id')
  @RequirePermissions('hr.attendance.view')
  @ApiOperation({ summary: 'Get an attendance record' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }
}