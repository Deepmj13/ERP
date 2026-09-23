import { Module } from '@nestjs/common';

import { FinanceService } from './finance.service';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsService } from './accounts/accounts.service';
import { JournalController } from './journal/journal.controller';
import { JournalService } from './journal/journal.service';
import { FiscalPeriodsController } from './fiscal-periods/fiscal-periods.controller';
import { FiscalPeriodsService } from './fiscal-periods/fiscal-periods.service';
import { BankController } from './bank/bank.controller';
import { BankService } from './bank/bank.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  controllers: [AccountsController, JournalController, FiscalPeriodsController, BankController, ReportsController],
  providers: [FinanceService, AccountsService, JournalService, FiscalPeriodsService, BankService, ReportsService],
  exports: [FinanceService],
})
export class FinanceModule {}