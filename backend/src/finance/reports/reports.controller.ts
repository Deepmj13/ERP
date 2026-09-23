import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { ReportsService } from './reports.service';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

class RangeQuery extends PageQuery {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

class TrialBalanceQuery extends RangeQuery {
  @IsOptional() @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']) account_type?: string;
}

class SingleQuery {
  @IsOptional() @IsString() as_of?: string;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('trial-balance')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Trial balance (derived from journal lines)' })
  trialBalance(@CurrentUser() user: AuthUser, @Query() q: TrialBalanceQuery) {
    return this.service.trialBalance(user, q.from, q.to, q.account_type);
  }

  @Get('general-ledger')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'General ledger lines for an account' })
  generalLedger(@CurrentUser() user: AuthUser, @Query('account_id') accountId: string, @Query() q: RangeQuery) {
    return this.service.generalLedger(user, accountId, q.from, q.to, q.page ?? 1, q.limit ?? 50);
  }

  @Get('accounts-receivable')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Aged accounts receivable per customer' })
  accountsReceivable(@CurrentUser() user: AuthUser, @Query() q: SingleQuery) {
    return this.service.accountsReceivable(user, q.as_of);
  }

  @Get('accounts-payable')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Accounts payable balance' })
  accountsPayable(@CurrentUser() user: AuthUser, @Query() q: SingleQuery) {
    return this.service.accountsPayable(user, q.as_of);
  }

  @Get('tax-summary')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Output tax collected by rate (from invoices)' })
  taxSummary(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.service.taxSummary(user, q.from, q.to);
  }

  @Get('income-statement')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Income statement (revenue − expenses)' })
  incomeStatement(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.service.incomeStatement(user, q.from, q.to);
  }

  @Get('balance-sheet')
  @RequirePermissions('finance.report.view')
  @ApiOperation({ summary: 'Balance sheet (assets, liabilities, equity + retained earnings)' })
  balanceSheet(@CurrentUser() user: AuthUser, @Query() q: SingleQuery) {
    return this.service.balanceSheet(user, q.as_of);
  }
}