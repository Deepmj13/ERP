import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'procurement_models.dart';
import 'procurement_repository.dart';

/// Repository → provider wiring for the procurement module (mirrors the
/// auth_providers pattern; plain providers avoid the @riverpod codegen step).
final procurementRepositoryProvider = Provider<ProcurementRepository>(
  (ref) => ProcurementRepository(ref.watch(apiClientProvider)),
);

final vendorsProvider = FutureProvider<List<Vendor>>(
  (ref) => ref.watch(procurementRepositoryProvider).vendors(),
);

final purchaseRequestsProvider = FutureProvider<List<PurchaseRequest>>(
  (ref) => ref.watch(procurementRepositoryProvider).purchaseRequests(),
);

final purchaseOrdersProvider = FutureProvider<List<PurchaseOrder>>(
  (ref) => ref.watch(procurementRepositoryProvider).purchaseOrders(),
);

final goodsReceiptsProvider = FutureProvider<List<GoodsReceipt>>(
  (ref) => ref.watch(procurementRepositoryProvider).goodsReceipts(),
);

final vendorBillsProvider = FutureProvider<List<VendorBill>>(
  (ref) => ref.watch(procurementRepositoryProvider).vendorBills(),
);

final vendorPaymentsProvider = FutureProvider<List<VendorPayment>>(
  (ref) => ref.watch(procurementRepositoryProvider).vendorPayments(),
);