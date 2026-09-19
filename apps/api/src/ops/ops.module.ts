import { Global, Module } from '@nestjs/common';

import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { ApprovalsController } from './approvals/approvals.controller';
import { ApprovalsService } from './approvals/approvals.service';
import { ApprovalTargetRegistry } from './approvals/approval-target.registry';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

/**
 * Phase 8 operational backbone. @Global so the domain modules can reuse the
 * approvals + notifications primitives during the retrofit without wiring
 * import cycles (mirrors JobsModule).
 */
@Global()
@Module({
  controllers: [
    ProjectsController,
    TasksController,
    ApprovalsController,
    NotificationsController,
    DashboardController,
  ],
  providers: [
    ProjectsService,
    TasksService,
    ApprovalsService,
    ApprovalTargetRegistry,
    NotificationsService,
    DashboardService,
  ],
  exports: [ApprovalsService, ApprovalTargetRegistry, NotificationsService],
})
export class OpsModule {}