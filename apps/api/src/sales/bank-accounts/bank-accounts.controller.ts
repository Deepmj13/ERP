import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { BankAccountsService } from './bank-accounts.service';

export class CreateBankAccountDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(64) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) accountName?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() openingBalance?: number;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(64) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(255) accountName?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() openingBalance?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('bank-accounts')
@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get()
  @RequirePermissions('finance.bank-account.view')
  @ApiOperation({ summary: 'List bank accounts' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('finance.bank-account.edit')
  @ApiOperation({ summary: 'Create a bank account' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBankAccountDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.bank-account.edit')
  @ApiOperation({ summary: 'Update a bank account' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.update(user, id, dto as unknown as Record<string, unknown>);
  }
}
