import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { PayrollRunsService } from './payroll-runs.service';

export class CreatePayrollRunDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('payroll-runs')
@Controller('payroll-runs')
export class PayrollRunsController {
  constructor(private readonly service: PayrollRunsService) {}

  @Get()
  @RequirePermissions('hr.payroll.view')
  @ApiOperation({ summary: 'List payroll runs' })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.list(user, status);
  }

  @Get(':id')
  @RequirePermissions('hr.payroll.view')
  @ApiOperation({ summary: 'Get a payroll run with its payslips' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('hr.payroll.run')
  @ApiOperation({ summary: 'Create a payroll run from a period (PR-YYYY-MM)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayrollRunDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/calculate')
  @RequirePermissions('hr.payroll.run')
  @ApiOperation({ summary: 'Compute draft payslips + run totals (DRAFT only)' })
  calculate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.calculate(user, id);
  }

  @Post(':id/approve')
  @RequirePermissions('hr.payroll.approve', 'hr.payroll.run')
  @ApiOperation({ summary: 'Approve a calculated run (DRAFT → APPROVED)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approve(user, id);
  }

  @Post(':id/post')
  @RequirePermissions('hr.payroll.post')
  @ApiOperation({ summary: 'Post a run (APPROVED → POSTED) and journal the salary entry' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }

  @Post(':id/reverse')
  @RequirePermissions('hr.payroll.reverse')
  @ApiOperation({ summary: 'Reverse a posted run (swapped journal lines)' })
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reverse(user, id);
  }
}