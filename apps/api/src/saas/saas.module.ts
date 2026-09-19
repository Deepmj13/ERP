import { Module } from '@nestjs/common';

import { PlansController } from './plans/plans.controller';
import { PlansService } from './plans/plans.service';
import { SubscriptionController } from './subscription/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { BillingController } from './billing/billing.controller';
import { BillingService } from './billing/billing.service';
import { BillingJobService } from './billing/billing.job.service';
import { UsageController } from './usage/usage.controller';
import { UsageService } from './usage/usage.service';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { SaasAssertionsService } from './saas-assertions.service';

/**
 * Phase 9 — SaaS platform (plan §27 Phase 9): plans, trials, billing (via the
 * `billing` BullMQ boundary), usage metrics + limits, and operator admin.
 * SaasAssertionsService is exported for limit enforcement in other modules
 * (e.g. UsersService user-count limits).
 */
@Module({
  controllers: [
    PlansController,
    SubscriptionController,
    BillingController,
    UsageController,
    AdminController,
  ],
  providers: [
    PlansService,
    SubscriptionService,
    BillingService,
    BillingJobService,
    UsageService,
    AdminService,
    SaasAssertionsService,
  ],
  exports: [SaasAssertionsService],
})
export class SaasModule {}