import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { TasksService } from './tasks.service';

export class CreateTaskDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsString() @MaxLength(255) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() mobileUuid?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() dueDate?: string | null;
}

class SetTaskStatusDto {
  @IsString() status!: string;
}

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  @RequirePermissions('ops.task.view')
  @ApiOperation({ summary: 'List tasks' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId?: string,
    @Query('assignee_id') assigneeId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('q') q?: string,
  ) {
    return this.service.list(user, { projectId, assigneeId, status, priority, q });
  }

  @Get(':id')
  @RequirePermissions('ops.task.view')
  @ApiOperation({ summary: 'Get a task' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('ops.task.edit')
  @ApiOperation({ summary: 'Create a task' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('ops.task.edit')
  @ApiOperation({ summary: 'Update a task' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }

  @Post(':id/status')
  @RequirePermissions('ops.task.status')
  @ApiOperation({ summary: 'Transition a task status' })
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetTaskStatusDto) {
    return this.service.setStatus(user, id, dto.status);
  }
}