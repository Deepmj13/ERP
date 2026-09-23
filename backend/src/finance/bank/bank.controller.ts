import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { BankService } from './bank.service';

export class BankTransactionRowDto {
  @IsString() bankAccountId!: string;
  @IsString() entryDate!: string;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional() @IsString() @MaxLength(64) reference?: string;
}

export class ImportBankTransactionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => BankTransactionRowDto) rows!: BankTransactionRowDto[];
}

export class MatchBankTransactionDto {
  @IsString() journalEntryId!: string;
}

@ApiTags('bank-transactions')
@Controller('bank-transactions')
export class BankController {
  constructor(private readonly service: BankService) {}

  @Get()
  @RequirePermissions('finance.bank.view')
  @ApiOperation({ summary: 'List bank transactions' })
  list(@CurrentUser() user: AuthUser, @Query('bank_account_id') bankAccountId?: string, @Query('status') status?: string) {
    return this.service.list(user, bankAccountId, status);
  }

  @Post('import')
  @RequirePermissions('finance.bank.edit')
  @ApiOperation({ summary: 'Import bank statement rows (Idempotency-Key)' })
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportBankTransactionsDto) {
    return this.service.import(user, dto.rows);
  }

  @Post(':id/reconcile')
  @RequirePermissions('finance.bank.reconcile')
  @ApiOperation({ summary: 'Mark a transaction reconciled' })
  reconcile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reconcile(user, id);
  }

  @Post(':id/match')
  @RequirePermissions('finance.bank.reconcile')
  @ApiOperation({ summary: 'Match a transaction to a posted journal entry' })
  match(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MatchBankTransactionDto) {
    return this.service.match(user, id, dto.journalEntryId);
  }
}