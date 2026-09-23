import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { DashboardService } from './dashboard.service';

class KpisQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

class TrendQueryDto extends KpisQueryDto {
  @IsOptional() @IsIn(['day', 'week', 'month']) interval?: string;
}

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('kpis')
  @RequirePermissions('ops.dashboard.view')
  @ApiOperation({ summary: 'Core KPI cards' })
  kpis(@CurrentUser() user: AuthUser, @Query() q: KpisQueryDto) {
    return this.service.kpis(user, q.from, q.to);
  }

  @Get('sales-trend')
  @RequirePermissions('ops.dashboard.view')
  @ApiOperation({ summary: 'Revenue trend (day/week/month buckets)' })
  salesTrend(@CurrentUser() user: AuthUser, @Query() q: TrendQueryDto) {
    return this.service.salesTrend(user, q.from, q.to, q.interval);
  }

  @Get('approvals-pending')
  @RequirePermissions('ops.dashboard.view')
  @ApiOperation({ summary: 'Approvals awaiting action (my inbox)' })
  approvalsPending(@CurrentUser() user: AuthUser) {
    return this.service.approvalsPending(user);
  }

  @Get('tasks-summary')
  @RequirePermissions('ops.dashboard.view')
  @ApiOperation({ summary: 'Task status summary' })
  tasksSummary(@CurrentUser() user: AuthUser) {
    return this.service.tasksSummary(user);
  }
}