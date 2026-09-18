import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { FiscalPeriodsService } from './fiscal-periods.service';

export class CreateFiscalPeriodDto {
  @IsString() @MaxLength(50) name!: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
}

@ApiTags('fiscal-periods')
@Controller('fiscal-periods')
export class FiscalPeriodsController {
  constructor(private readonly service: FiscalPeriodsService) {}

  @Get()
  @RequirePermissions('finance.period.view')
  @ApiOperation({ summary: 'List fiscal periods' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('finance.period.edit')
  @ApiOperation({ summary: 'Create a fiscal period' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFiscalPeriodDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/close')
  @RequirePermissions('finance.period.close')
  @ApiOperation({ summary: 'Close a fiscal period (no further posting)' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.close(user, id);
  }
}