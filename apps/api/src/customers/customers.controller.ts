import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';

export class CreateCustomerDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) website?: string;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) website?: string;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateContactDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @RequirePermissions('crm.customer.view')
  @ApiOperation({ summary: 'List customers (optional ?q= name filter)' })
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.list(user, q);
  }

  @Post()
  @RequirePermissions('crm.customer.edit')
  @ApiOperation({ summary: 'Create a customer' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('crm.customer.view')
  @ApiOperation({ summary: 'Get a customer with its contacts' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('crm.customer.edit')
  @ApiOperation({ summary: 'Update a customer' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.service.update(user, id, dto);
  }

  @Get(':id/contacts')
  @RequirePermissions('crm.customer.view')
  @ApiOperation({ summary: "List a customer's contacts" })
  contacts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.contacts(user, id);
  }

  @Post(':id/contacts')
  @RequirePermissions('crm.customer.edit')
  @ApiOperation({ summary: 'Add a contact to a customer' })
  addContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.service.addContact(user, id, dto);
  }

  @Patch('contacts/:id')
  @RequirePermissions('crm.customer.edit')
  @ApiOperation({ summary: 'Update a customer contact' })
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.service.updateContact(user, id, dto);
  }
}
