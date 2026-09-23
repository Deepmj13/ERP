import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { JWT_SETTINGS } from './auth.constants';
import { Configuration } from '../config/configuration';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    {
      provide: JWT_SETTINGS,
      useFactory: (config: ConfigService) => Configuration.register(config).jwt,
      inject: [ConfigService],
    },
  ],
  exports: [SessionService, JWT_SETTINGS, JwtModule],
})
export class AuthModule {}
