import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { NotificationsService } from './notifications.service';

class PreferenceDto {
  @IsIn(['IN_APP', 'EMAIL', 'PUSH'])
  channel!: string;
  @IsOptional() enabled?: boolean;
  @IsOptional() @IsString() quietStart?: string | null;
  @IsOptional() @IsString() quietEnd?: string | null;
}

export class SetPreferencesDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreferenceDto)
  preferences!: PreferenceDto[];
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @RequirePermissions('ops.notification.view')
  @ApiOperation({ summary: 'List notifications (inbox)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('unread_only') unreadOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(
      user,
      unreadOnly === 'true',
      Number.parseInt(page ?? '1', 10) || 1,
      Number.parseInt(limit ?? '50', 10) || 50,
    );
  }

  @Get('unread-count')
  @RequirePermissions('ops.notification.view')
  @ApiOperation({ summary: 'Count unread notifications' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.service.unreadCount(user);
    return { count };
  }

  @Get('preferences')
  @RequirePermissions('ops.notification.view')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.service.getPreferences(user);
  }

  @Patch('preferences')
  @RequirePermissions('ops.notification.view')
  @ApiOperation({ summary: 'Update notification preferences' })
  setPreferences(@CurrentUser() user: AuthUser, @Body() dto: SetPreferencesDto) {
    return this.service.setPreferences(user, dto.preferences);
  }

  @Post('read-all')
  @RequirePermissions('ops.notification.view')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user);
  }
}