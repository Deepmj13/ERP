import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { ProjectsService } from './projects.service';

export class CreateProjectDto {
  @IsString() @MaxLength(32) code!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() budget?: number;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() startDate?: string | null;
  @IsOptional() @IsString() endDate?: string | null;
  @IsOptional() @IsNumber() budget?: number | null;
}

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  @RequirePermissions('ops.project.view')
  @ApiOperation({ summary: 'List projects' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string) {
    return this.service.list(user, q, status);
  }

  @Get(':id')
  @RequirePermissions('ops.project.view')
  @ApiOperation({ summary: 'Get a project with tasks' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('ops.project.edit')
  @ApiOperation({ summary: 'Create a project' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('ops.project.edit')
  @ApiOperation({ summary: 'Update a project' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }
}