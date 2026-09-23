import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { SalaryStructuresService } from './salary-structures.service';

export class CreateSalaryStructureDto {
  @IsString() employeeId!: string;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsNumber() basicSalary!: number;
  @IsOptional() @IsObject() allowances?: Record<string, unknown>;
  @IsOptional() @IsObject() deductions?: Record<string, unknown>;
  @IsOptional() @IsString() payStructureNotes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSalaryStructureDto {
  @IsOptional() @IsNumber() basicSalary?: number;
  @IsOptional() @IsObject() allowances?: Record<string, unknown>;
  @IsOptional() @IsObject() deductions?: Record<string, unknown>;
  @IsOptional() @IsString() payStructureNotes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('salary-structures')
@Controller('salary-structures')
export class SalaryStructuresController {
  constructor(private readonly service: SalaryStructuresService) {}

  @Get()
  @RequirePermissions('hr.salary.view')
  @ApiOperation({ summary: 'List salary structures' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('employee_id') employeeId?: string,
    @Query('q') q?: string,
  ) {
    return this.service.list(user, employeeId, q);
  }

  @Get(':id')
  @RequirePermissions('hr.salary.view')
  @ApiOperation({ summary: 'Get a salary structure' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('hr.salary.edit')
  @ApiOperation({ summary: 'Create a salary structure (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalaryStructureDto) {
    return this.service.create(user, dto as never);
  }

  @Patch(':id')
  @RequirePermissions('hr.salary.edit')
  @ApiOperation({ summary: 'Update a salary structure' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSalaryStructureDto) {
    return this.service.update(user, id, dto as never);
  }
}