import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';
import { BankAccountsController } from './bank-accounts/bank-accounts.controller';
import { BankAccountsService } from './bank-accounts/bank-accounts.service';
import { QuotationsController } from './quotations/quotations.controller';
import { QuotationsService } from './quotations/quotations.service';
import { QuotationsApprovalTarget } from './quotations/quotations.approval-target';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OrdersApprovalTarget } from './orders/orders.approval-target';
import { DeliveriesController } from './deliveries/deliveries.controller';
import { DeliveriesService } from './deliveries/deliveries.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

@Module({
  imports: [InventoryModule, FinanceModule],
  controllers: [
    BankAccountsController,
    QuotationsController,
    OrdersController,
    DeliveriesController,
    InvoicesController,
    PaymentsController,
  ],
  providers: [
    BankAccountsService,
    QuotationsService,
    QuotationsApprovalTarget,
    OrdersService,
    OrdersApprovalTarget,
    DeliveriesService,
    InvoicesService,
    PaymentsService,
  ],
})
export class SalesModule {}
