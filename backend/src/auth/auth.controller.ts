import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { AuthContext, AuthUser } from './auth.types';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create tenant + company + owner account' })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthContext> {
    return this.auth.register(dto, deviceFrom(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify credentials and issue tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthContext> {
    return this.auth.login(dto, deviceFrom(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token; revoke family on reuse' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthContext> {
    return this.auth.refresh(dto, deviceFrom(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the session' })
  logout(@Body() dto: LogoutDto): Promise<{ ok: true }> {
    return this.auth.logout(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user + active tenant' })
  me(@CurrentUser() user: AuthUser) {
    return {
      user: { id: user.userId, email: user.email },
      tenantId: user.tenantId,
    };
  }
}

function deviceFrom(req: Request): string | undefined {
  const agent = req.headers['user-agent'];
  return typeof agent === 'string' ? agent.slice(0, 255) : undefined;
}
