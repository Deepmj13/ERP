import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

export class InviteUserDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsArray() @IsString({ each: true }) roleIds!: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(255) fullName?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[];
}

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @RequirePermissions('org.user.view')
  @ApiOperation({ summary: 'List tenant users with roles' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listInTenant(user);
  }

  @Post('invite')
  @RequirePermissions('org.user.invite')
  @ApiOperation({ summary: 'Invite a user into the active tenant' })
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.service.invite(user, { email: dto.email, name: dto.name, roleIds: dto.roleIds });
  }

  @Patch(':id')
  @RequirePermissions('org.user.edit')
  @ApiOperation({ summary: 'Update user profile, status, or role assignments' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(user, id, {
      fullName: dto.fullName,
      status: dto.status,
      roleIds: dto.roleIds,
    });
  }
}
