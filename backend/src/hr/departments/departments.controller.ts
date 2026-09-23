import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { DepartmentsService } from './departments.service';

export class CreateDepartmentDto {
  @IsString() @MaxLength(32) code!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

@ApiTags('departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  @RequirePermissions('hr.department.view')
  @ApiOperation({ summary: 'List departments' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.list(user, q);
  }

  @Post()
  @RequirePermissions('hr.department.edit')
  @ApiOperation({ summary: 'Create a department (Idempotency-Key required)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('hr.department.view')
  @ApiOperation({ summary: 'Get a department' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('hr.department.edit')
  @ApiOperation({ summary: 'Update a department' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(user, id, dto);
  }
}