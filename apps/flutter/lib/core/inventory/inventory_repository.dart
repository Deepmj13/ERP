import '../network/api_client.dart';
import '../network/idempotency.dart';
import 'inventory_models.dart';

/// Talks to the `/warehouses` and `/stock*` resources (apps/api/src/inventory).
/// Every mutating call carries a fresh Idempotency-Key (plan §16a).
class InventoryRepository {
  InventoryRepository(this._api);

  final ApiClient _api;

  // ── Warehouses ─────────────────────────────────────────────────────────────
  Future<List<Warehouse>> warehouses() async =>
      _list(_api.get('/warehouses'), Warehouse.fromJson);

  Future<Warehouse> createWarehouse({
    required String code,
    required String name,
    bool? isActive,
  }) async {
    final result = await _api.post(
      '/warehouses',
      body: {'code': code, 'name': name, 'isActive': ?isActive},
      headers: idempotencyHeaders(),
    );
    return Warehouse.fromJson(result.data);
  }

  Future<Warehouse> updateWarehouse(String id, {String? name, bool? isActive}) async {
    final result = await _api.patch(
      '/warehouses/$id',
      body: {'name': ?name, 'isActive': ?isActive},
      headers: idempotencyHeaders(),
    );
    return Warehouse.fromJson(result.data);
  }

  // ── Stock balances ─────────────────────────────────────────────────────────
  Future<List<StockBalance>> stockBalances({String? warehouseId, String? productId, String? q}) async =>
      _list(
        _api.get('/stock', query: {
          'warehouse': ?warehouseId,
          'product': ?productId,
          if (q != null && q.isNotEmpty) 'q': q,
        }),
        StockBalance.fromJson,
      );

  // ── Movements ledger ───────────────────────────────────────────────────────
  Future<List<StockMovement>> movements({
    String? productId,
    String? warehouseId,
    String? type,
    String? from,
    String? to,
  }) async =>
      _list(
        _api.get('/stock/movements', query: {
          'product': ?productId,
          'warehouse': ?warehouseId,
          'type': ?type,
          'from': ?from,
          'to': ?to,
        }),
        StockMovement.fromJson,
      );

  // ── Low stock ──────────────────────────────────────────────────────────────
  Future<List<StockBalance>> lowStock({double? threshold}) async =>
      _list(
        _api.get('/stock/on-hand/low', query: {'threshold': ?threshold}),
        StockBalance.fromJson,
      );

  // ── Serials / batches ──────────────────────────────────────────────────────
  Future<List<SerialNumber>> serials({String? productId, String? status}) async =>
      _list(
        _api.get('/stock/serial-numbers', query: {
          'product': ?productId,
          'status': ?status,
        }),
        SerialNumber.fromJson,
      );

  Future<List<Batch>> batches({String? productId}) async =>
      _list(
        _api.get('/stock/batches', query: {'product': ?productId}),
        Batch.fromJson,
      );

  // ── Mutations ──────────────────────────────────────────────────────────────
  Future<void> adjust({
    required String warehouseId,
    required String productId,
    required double quantity,
    String? reason,
  }) async {
    await _api.post(
      '/stock/adjustments',
      body: {
        'warehouseId': warehouseId,
        'productId': productId,
        'quantity': quantity,
        'reason': ?reason,
      },
      headers: idempotencyHeaders(),
    );
  }

  Future<void> transfer(List<Map<String, dynamic>> lines) async {
    await _api.post(
      '/stock/transfers',
      body: {'lines': lines},
      headers: idempotencyHeaders(),
    );
  }

  Future<void> stocktake({
    required String warehouseId,
    required String productId,
    required double counted,
    String? reason,
  }) async {
    await _api.post(
      '/stock/takes',
      body: {
        'warehouseId': warehouseId,
        'productId': productId,
        'counted': counted,
        'reason': ?reason,
      },
      headers: idempotencyHeaders(),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  Future<List<T>> _list<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final result = await call;
    final raw = result.raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}