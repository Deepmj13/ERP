import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { RolesService } from './roles.service';

export class CreateRoleDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsArray() @IsString({ each: true }) permissionCodes!: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get()
  @RequirePermissions('org.role.view')
  @ApiOperation({ summary: 'List tenant roles with their permission codes' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user);
  }

  @Post()
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Create a role with permission codes' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.service.create(user, { name: dto.name, permissionCodes: dto.permissionCodes });
  }

  @Patch(':id')
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Rename a role or replace its permission codes' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(user, id, {
      name: dto.name,
      permissionCodes: dto.permissionCodes,
    });
  }

  @Delete(':id')
  @RequirePermissions('org.role.edit')
  @ApiOperation({ summary: 'Delete a non-system role' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
