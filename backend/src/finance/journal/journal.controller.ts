import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { JournalService } from './journal.service';

export class JournalLineDto {
  @IsString() accountId!: string;
  @IsOptional() @IsNumber() debit?: number;
  @IsOptional() @IsNumber() credit?: number;
  @IsOptional() @IsString() narration?: string;
}

export class CreateJournalDto {
  @IsString() entryDate!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}

@ApiTags('journal-entries')
@Controller('journal-entries')
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Get()
  @RequirePermissions('finance.journal.view')
  @ApiOperation({ summary: 'List journal entries' })
  list(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string) {
    return this.service.list(user, from, to, status);
  }

  @Get(':id')
  @RequirePermissions('finance.journal.view')
  @ApiOperation({ summary: 'Get journal entry with lines' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post()
  @RequirePermissions('finance.journal.post')
  @ApiOperation({ summary: 'Create a draft journal entry (balanced)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateJournalDto) {
    return this.service.create(user, dto);
  }

  @Post(':id/post')
  @RequirePermissions('finance.journal.post')
  @ApiOperation({ summary: 'Post a draft entry (assigns JE number)' })
  post(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.post(user, id);
  }

  @Post(':id/reverse')
  @RequirePermissions('finance.journal.reverse')
  @ApiOperation({ summary: 'Reverse a posted entry (swapped lines)' })
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.reverse(user, id);
  }
}