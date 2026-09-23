import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UnitsService } from './units.service';

export class CreateUnitDto {
  @IsString() @MaxLength(100) name!: string;
  @IsString() @MaxLength(16) code!: string;
  @IsOptional() @IsString() @MaxLength(16) symbol?: string;
  @IsOptional() @IsString() baseUnitId?: string;
  @IsOptional() @IsNumber() @Min(0) factorToBase?: number;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(16) code?: string;
  @IsOptional() @IsString() @MaxLength(16) symbol?: string | null;
  @IsOptional() @IsString() baseUnitId?: string | null;
  @IsOptional() @IsNumber() @Min(0) factorToBase?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('units')
@Controller('units')
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get()
  @RequirePermissions('inventory.unit.view')
  @ApiOperation({ summary: 'List units of measure' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('inventory.unit.edit')
  @ApiOperation({ summary: 'Create a unit of measure' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUnitDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.unit.edit')
  @ApiOperation({ summary: 'Update a unit of measure' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUnitDto) {
    return this.service.update(user, id, dto);
  }
}
