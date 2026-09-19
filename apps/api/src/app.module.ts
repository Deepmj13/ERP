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
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { UnitsModule } from './units/units.module';
import { TaxRatesModule } from './tax-rates/tax-rates.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { FinanceModule } from './finance/finance.module';
import { ProcurementModule } from './procurement/procurement.module';
import { HrModule } from './hr/hr.module';
import { StorageModule } from '@erp/storage';
import { DatabaseInfraModule } from './common/database/database-infra.module';
import { JobsModule } from './jobs/jobs.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * Platform foundation module (plan §6). Guard order matters: JwtAuthGuard
 * resolves the tenant context first, then PermissionsGuard checks the route's
 * permission codes against it. Interceptor order matters too:
 * TenantContextInterceptor runs outermost so the RLS tenant context is armed
 * before IdempotencyInterceptor claims the key, and a replayed request
 * short-circuits before the response envelope is built.
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
    CustomersModule,
    ProductsModule,
    CategoriesModule,
    UnitsModule,
    TaxRatesModule,
    InventoryModule,
    SalesModule,
    FinanceModule,
    ProcurementModule,
    HrModule,
    StorageModule,
    DatabaseInfraModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
