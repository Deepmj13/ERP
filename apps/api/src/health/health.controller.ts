import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  health(): { data: { status: string; uptime: number } } {
    return { data: { status: 'ok', uptime: process.uptime() } };
  }
}
