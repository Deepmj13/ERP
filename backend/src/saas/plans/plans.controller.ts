import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { Public } from '../../common/decorators/auth.decorators';
import { PlansService } from './plans.service';

export class ListPlansQuery {
  @IsOptional() @IsString() interval?: string;
}

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}

  /** Public catalog — the register flow and pricing page both read it. */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List subscription plans' })
  list(@Query() q: ListPlansQuery) {
    return this.service.list(q.interval);
  }
}