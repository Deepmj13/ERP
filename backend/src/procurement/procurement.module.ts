import { Module } from '@nestjs/common';

import { VendorsController } from './vendors/vendors.controller';
import { VendorsService } from './vendors/vendors.service';
import { PurchaseRequestsController } from './purchase-requests/purchase-requests.controller';
import { PurchaseRequestsService } from './purchase-requests/purchase-requests.service';
import { PurchaseRequestsApprovalTarget } from './purchase-requests/purchase-requests.approval-target';
import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { PurchaseOrdersApprovalTarget } from './purchase-orders/purchase-orders.approval-target';
import { GoodsReceiptsController } from './goods-receipts/goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts/goods-receipts.service';
import { VendorBillsController } from './vendor-bills/vendor-bills.controller';
import { VendorBillsService } from './vendor-bills/vendor-bills.service';
import { VendorPaymentsController } from './vendor-payments/vendor-payments.controller';
import { VendorPaymentsService } from './vendor-payments/vendor-payments.service';
import { InventoryModule } from '../inventory/inventory.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [InventoryModule, FinanceModule],
  controllers: [
    VendorsController,
    PurchaseRequestsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    VendorBillsController,
    VendorPaymentsController,
  ],
  providers: [
    VendorsService,
    PurchaseRequestsService,
    PurchaseRequestsApprovalTarget,
    PurchaseOrdersService,
    PurchaseOrdersApprovalTarget,
    GoodsReceiptsService,
    VendorBillsService,
    VendorPaymentsService,
  ],
})
export class ProcurementModule {}