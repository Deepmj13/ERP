import { Module } from '@nestjs/common';

import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
import { EmployeesController } from './employees/employees.controller';
import { EmployeesService } from './employees/employees.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { LeaveTypesController } from './leave-types/leave-types.controller';
import { LeaveTypesService } from './leave-types/leave-types.service';
import { LeavesController } from './leaves/leaves.controller';
import { LeavesService } from './leaves/leaves.service';
import { LeavesApprovalTarget } from './leaves/leaves.approval-target';
import { SalaryStructuresController } from './salary-structures/salary-structures.controller';
import { SalaryStructuresService } from './salary-structures/salary-structures.service';
import { PayrollRunsController } from './payroll-runs/payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs/payroll-runs.service';
import { PayrollRunsApprovalTarget } from './payroll-runs/payroll-runs.approval-target';
import { PayslipsController } from './payslips/payslips.controller';
import { PayslipsService } from './payslips/payslips.service';

import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [FinanceModule],
  controllers: [
    DepartmentsController,
    EmployeesController,
    AttendanceController,
    LeaveTypesController,
    LeavesController,
    SalaryStructuresController,
    PayrollRunsController,
    PayslipsController,
  ],
  providers: [
    DepartmentsService,
    EmployeesService,
    AttendanceService,
    LeaveTypesService,
    LeavesService,
    LeavesApprovalTarget,
    SalaryStructuresService,
    PayrollRunsService,
    PayrollRunsApprovalTarget,
    PayslipsService,
  ],
})
export class HrModule {}