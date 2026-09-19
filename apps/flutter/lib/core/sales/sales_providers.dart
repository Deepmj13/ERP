import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'sales_models.dart';
import 'sales_repository.dart';

/// Repository → provider wiring for the sales module (mirrors the procurement
/// providers pattern; plain providers avoid the @riverpod codegen step).
final salesRepositoryProvider = Provider<SalesRepository>(
  (ref) => SalesRepository(ref.watch(apiClientProvider)),
);

final customersProvider = FutureProvider<List<CustomerRef>>(
  (ref) => ref.watch(salesRepositoryProvider).customers(),
);

final productsProvider = FutureProvider<List<ProductRef>>(
  (ref) => ref.watch(salesRepositoryProvider).products(),
);

final unitsProvider = FutureProvider<List<UnitRef>>(
  (ref) => ref.watch(salesRepositoryProvider).units(),
);

final taxRatesProvider = FutureProvider<List<TaxRateRef>>(
  (ref) => ref.watch(salesRepositoryProvider).taxRates(),
);

final warehousesProvider = FutureProvider<List<WarehouseRef>>(
  (ref) => ref.watch(salesRepositoryProvider).warehouses(),
);

final bankAccountsProvider = FutureProvider<List<BankAccount>>(
  (ref) => ref.watch(salesRepositoryProvider).bankAccounts(),
);

final quotationsProvider = FutureProvider<List<Quotation>>(
  (ref) => ref.watch(salesRepositoryProvider).quotations(),
);

final salesOrdersProvider = FutureProvider<List<SalesOrder>>(
  (ref) => ref.watch(salesRepositoryProvider).salesOrders(),
);

final deliveriesProvider = FutureProvider<List<Delivery>>(
  (ref) => ref.watch(salesRepositoryProvider).deliveries(),
);

final invoicesProvider = FutureProvider<List<Invoice>>(
  (ref) => ref.watch(salesRepositoryProvider).invoices(),
);

final paymentsProvider = FutureProvider<List<Payment>>(
  (ref) => ref.watch(salesRepositoryProvider).payments(),
);