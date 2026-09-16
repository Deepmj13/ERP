import { Module } from '@nestjs/common';

import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockLedgerService } from './stock-ledger.service';

@Module({
  controllers: [WarehousesController, StockController],
  providers: [WarehousesService, StockService, StockLedgerService],
  exports: [StockLedgerService],
})
export class InventoryModule {}
