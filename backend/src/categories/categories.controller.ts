import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { CategoriesService } from './categories.service';

export class CreateCategoryDto {
  @IsOptional() @IsString() parentId?: string;
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @RequirePermissions('inventory.category.view')
  @ApiOperation({ summary: 'List product categories with their immediate children' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('inventory.category.edit')
  @ApiOperation({ summary: 'Create a product category' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.category.edit')
  @ApiOperation({ summary: 'Update a product category' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(user, id, dto);
  }
}
