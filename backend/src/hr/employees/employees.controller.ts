import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { EmployeesService } from './employees.service';

export class CreateEmployeeDto {
  @IsString() @MaxLength(32) employeeNo!: string;
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsOptional() @IsString() @MaxLength(32) departmentId?: string;
  @IsOptional() @IsString() @MaxLength(36) userId?: string;
  @IsOptional() @IsString() @MaxLength(100) jobTitle?: string;
  @IsOptional() @IsDateString() joinDate?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() @MaxLength(32) employeeNo?: string;
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(32) departmentId?: string;
  @IsOptional() @IsString() @MaxLength(100) jobTitle?: string;
  @IsOptional() @IsDateString() joinDate?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @RequirePermissions('hr.employee.view')
  @ApiOperation({ summary: 'List employees' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('department_id') departmentId?: string,
  ) {
    return this.service.list(user, q, status, departmentId);
  }

  @Post()
  @RequirePermissions('hr.employee.edit')
  @ApiOperation({ summary: 'Create an employee (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('hr.employee.view')
  @ApiOperation({ summary: 'Get an employee' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('hr.employee.edit')
  @ApiOperation({ summary: 'Update an employee' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(user, id, dto);
  }
}