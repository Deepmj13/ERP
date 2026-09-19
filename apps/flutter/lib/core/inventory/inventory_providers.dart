import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'inventory_models.dart';
import 'inventory_repository.dart';

/// Repository → provider wiring for the inventory module (plain providers,
/// mirroring the procurement/sales pattern).
final inventoryRepositoryProvider = Provider<InventoryRepository>(
  (ref) => InventoryRepository(ref.watch(apiClientProvider)),
);

final warehousesProvider = FutureProvider<List<Warehouse>>(
  (ref) => ref.watch(inventoryRepositoryProvider).warehouses(),
);

final stockBalancesProvider = FutureProvider<List<StockBalance>>(
  (ref) => ref.watch(inventoryRepositoryProvider).stockBalances(),
);

final stockMovementsProvider = FutureProvider<List<StockMovement>>(
  (ref) => ref.watch(inventoryRepositoryProvider).movements(),
);

final lowStockProvider = FutureProvider<List<StockBalance>>(
  (ref) => ref.watch(inventoryRepositoryProvider).lowStock(),
);

final serialNumbersProvider = FutureProvider<List<SerialNumber>>(
  (ref) => ref.watch(inventoryRepositoryProvider).serials(),
);

final batchesProvider = FutureProvider<List<Batch>>(
  (ref) => ref.watch(inventoryRepositoryProvider).batches(),
);