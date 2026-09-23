import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
import { OrganizationService } from './organization.service';

export class UpdateCompanyDto {
  @IsOptional() @IsString() @MaxLength(255) legalName?: string;
  @IsOptional() @IsString() @MaxLength(64) taxId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(2) country?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class CreateBranchDto {
  @IsString() companyId!: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class UpdateBranchDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('organization')
@Controller('organization')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Get('company')
  @RequirePermissions('org.role.view')
  @ApiOperation({ summary: 'Company profile of the active tenant' })
  company(@CurrentUser() user: AuthUser) {
    return this.service.company(user);
  }

  @Patch('company')
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Update company profile fields' })
  updateCompany(@CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompany(user, dto);
  }

  @Get('branches')
  @RequirePermissions('org.role.view')
  @ApiOperation({ summary: 'List branches' })
  branches(@CurrentUser() user: AuthUser) {
    return this.service.branches(user);
  }

  @Post('branches')
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Create a branch under the tenant company' })
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.service.createBranch(user, dto);
  }

  @Patch('branches/:id')
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Update a branch' })
  updateBranch(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.service.updateBranch(user, id, dto);
  }
}
