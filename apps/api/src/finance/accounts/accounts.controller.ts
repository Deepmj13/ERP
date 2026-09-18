import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { AccountsService } from './accounts.service';

export class CreateAccountDto {
  @IsString() accountGroupId!: string;
  @IsString() @MaxLength(32) code!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']) type!: string;
  @IsOptional() @IsNumber() openingDebit?: number;
  @IsOptional() @IsNumber() openingCredit?: number;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @RequirePermissions('finance.account.view')
  @ApiOperation({ summary: 'List chart of accounts' })
  list(@CurrentUser() user: AuthUser, @Query('type') type?: string, @Query('q') q?: string, @Query('group') group?: string) {
    return this.service.list(user, type, q, group);
  }

  @Get('account-groups')
  @RequirePermissions('finance.account.view')
  @ApiOperation({ summary: 'List account groups (COA tree)' })
  accountGroups(@CurrentUser() user: AuthUser) {
    return this.service.accountGroups(user);
  }

  @Get(':id')
  @RequirePermissions('finance.account.view')
  @ApiOperation({ summary: 'Get account' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('finance.account.edit')
  @ApiOperation({ summary: 'Create an account' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('finance.account.edit')
  @ApiOperation({ summary: 'Update a non-system account' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.service.update(user, id, dto);
  }
}