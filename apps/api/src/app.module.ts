import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { OrganizationModule } from './organization/organization.module';
import { StorageModule } from './storage/storage.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Platform foundation module (plan §6). Guard order matters: JwtAuthGuard
 * resolves the tenant context first, then PermissionsGuard checks the route's
 * permission codes against it. IdempotencyInterceptor runs outermost so a
 * replayed request short-circuits before the response envelope is built.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    HealthModule,
    PrismaModule,
    AuthModule,
    AuditModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    OrganizationModule,
    StorageModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
