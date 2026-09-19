import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/auth.decorators';
import { AuthUser } from '../../auth/auth.types';
import { ApprovalsService } from './approvals.service';

export class CreateApprovalRequestDto {
  @IsString() @MaxLength(32) objectType!: string;
  @IsString() objectId!: string;
  @IsOptional() @IsString() @MaxLength(32) objectNumber?: string;
  @IsOptional() @IsString() approverId?: string;
}

class DecideApprovalDto {
  @IsOptional() @IsString() comment?: string;
}

@ApiTags('approvals')
@Controller()
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get('approvals')
  @RequirePermissions('ops.approval.view')
  @ApiOperation({ summary: 'List approval requests (inbox or requested)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope: string = 'inbox',
    @Query('object_type') objectType?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(user, scope, objectType, status);
  }

  @Get('approval-requests/:id')
  @RequirePermissions('ops.approval.view')
  @ApiOperation({ summary: 'Get an approval request' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Post('approval-requests')
  @RequirePermissions('ops.approval.act')
  @ApiOperation({ summary: 'Record an approval request (submit endpoint)' })
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateApprovalRequestDto) {
    return this.service.request(user, dto);
  }

  @Post('approval-requests/:id/approve')
  @RequirePermissions('ops.approval.act')
  @ApiOperation({ summary: 'Approve an approval request' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    return this.service.act(user, id, 'APPROVED', dto.comment);
  }

  @Post('approval-requests/:id/reject')
  @RequirePermissions('ops.approval.act')
  @ApiOperation({ summary: 'Reject an approval request' })
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    return this.service.act(user, id, 'REJECTED', dto.comment);
  }
}