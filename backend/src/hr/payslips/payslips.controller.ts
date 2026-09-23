import { Controller, Get, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { PayslipsService } from './payslips.service';

@ApiTags('payslips')
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly service: PayslipsService) {}

  @Get()
  @RequirePermissions('hr.payslip.view')
  @ApiOperation({ summary: 'List payslips (optionally by run or employee)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('payroll_run_id') payrollRunId?: string,
    @Query('employee_id') employeeId?: string,
  ) {
    return this.service.list(user, payrollRunId, employeeId);
  }

  @Post(':id/pdf')
  @RequirePermissions('hr.payslip.generate')
  @ApiOperation({ summary: 'Queue PDF generation for a payslip' })
  queuePdf(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.queuePdf(user, id);
  }

  @Get(':id/pdf/download')
  @RequirePermissions('hr.payslip.view')
  @ApiOperation({ summary: 'Download the latest generated payslip PDF' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const output = await this.service.download(user, id);
    res.set({
      'Content-Type': output.contentType,
      'Content-Length': output.buffer.length.toString(),
      'Content-Disposition': `attachment; filename="${output.fileName}"`,
      'Cache-Control': 'no-store',
    });
    res.status(HttpStatus.OK).send(output.buffer);
  }
}