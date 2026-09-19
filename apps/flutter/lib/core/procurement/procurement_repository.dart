import 'dart:math';

import '../network/api_client.dart';
import 'procurement_models.dart';

/// Talks to the `/procurement*` backend resources. All mutating calls carry a
/// fresh Idempotency-Key (backend G-1/G-6 rule: required on every mutating
/// endpoint). List endpoints return `{ data: [...] }`; the parser exposes the
/// raw list via [ApiResult.raw].
class ProcurementRepository {
  ProcurementRepository(this._api);

  final ApiClient _api;
  final Random _random = Random.secure();

  // ── Vendors ────────────────────────────────────────────────────────────────
  Future<List<Vendor>> vendors() async =>
      _list(_api.get('/vendors'), Vendor.fromJson);

  Future<Vendor> createVendor({required String name, String? email}) async {
    final result = await _api.post(
      '/vendors',
      body: {'name': name, 'email': ?email},
      headers: _idempotencyHeaders(),
    );
    return Vendor.fromJson(result.data);
  }

  // ── Purchase requests ──────────────────────────────────────────────────────
  Future<List<PurchaseRequest>> purchaseRequests() async =>
      _list(_api.get('/purchase-requests'), PurchaseRequest.fromJson);

  Future<PurchaseRequest> createPurchaseRequest({
    required List<Map<String, dynamic>> items,
    String? notes,
  }) async {
    final result = await _api.post(
      '/purchase-requests',
      body: {'items': items, 'notes': ?notes},
      headers: _idempotencyHeaders(),
    );
    return PurchaseRequest.fromJson(result.data);
  }

  Future<PurchaseRequest> submitRequest(String id) async =>
      _doc(_api.post('/purchase-requests/$id/submit', headers: _idempotencyHeaders()),
          PurchaseRequest.fromJson);

  Future<PurchaseRequest> approveRequest(String id) async =>
      _doc(_api.post('/purchase-requests/$id/approve', headers: _idempotencyHeaders()),
          PurchaseRequest.fromJson);

  Future<PurchaseRequest> cancelRequest(String id) async =>
      _doc(_api.post('/purchase-requests/$id/cancel', headers: _idempotencyHeaders()),
          PurchaseRequest.fromJson);

  // ── Purchase orders ────────────────────────────────────────────────────────
  Future<List<PurchaseOrder>> purchaseOrders() async =>
      _list(_api.get('/purchase-orders'), PurchaseOrder.fromJson);

  Future<PurchaseOrder> createPurchaseOrder({
    required String vendorId,
    String? sourceRequestId,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/purchase-orders',
      body: {
        'vendorId': vendorId,
        'sourceRequestId': ?sourceRequestId,
        'items': items,
      },
      headers: _idempotencyHeaders(),
    );
    return PurchaseOrder.fromJson(result.data);
  }

  Future<PurchaseOrder> submitOrder(String id) async =>
      _doc(_api.post('/purchase-orders/$id/submit', headers: _idempotencyHeaders()),
          PurchaseOrder.fromJson);

  Future<PurchaseOrder> approveOrder(String id) async =>
      _doc(_api.post('/purchase-orders/$id/approve', headers: _idempotencyHeaders()),
          PurchaseOrder.fromJson);

  Future<PurchaseOrder> cancelOrder(String id) async =>
      _doc(_api.post('/purchase-orders/$id/cancel', headers: _idempotencyHeaders()),
          PurchaseOrder.fromJson);

  // ── Goods receipts ─────────────────────────────────────────────────────────
  Future<List<GoodsReceipt>> goodsReceipts() async =>
      _list(_api.get('/goods-receipts'), GoodsReceipt.fromJson);

  Future<GoodsReceipt> createGoodsReceipt({
    required String purchaseOrderId,
    String? warehouseId,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/goods-receipts',
      body: {
        'purchaseOrderId': purchaseOrderId,
        'warehouseId': ?warehouseId,
        'items': items,
      },
      headers: _idempotencyHeaders(),
    );
    return GoodsReceipt.fromJson(result.data);
  }

  Future<GoodsReceipt> postGoodsReceipt(String id) async =>
      _doc(_api.post('/goods-receipts/$id/post', headers: _idempotencyHeaders()),
          GoodsReceipt.fromJson);

  // ── Vendor bills ───────────────────────────────────────────────────────────
  Future<List<VendorBill>> vendorBills() async =>
      _list(_api.get('/vendor-bills'), VendorBill.fromJson);

  Future<VendorBill> createVendorBill({
    required String vendorId,
    String? purchaseOrderId,
    String? goodsReceiptId,
    required String issueDate,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/vendor-bills',
      body: {
        'vendorId': vendorId,
        'purchaseOrderId': ?purchaseOrderId,
        'goodsReceiptId': ?goodsReceiptId,
        'issueDate': issueDate,
        'items': items,
      },
      headers: _idempotencyHeaders(),
    );
    return VendorBill.fromJson(result.data);
  }

  Future<VendorBill> submitBill(String id) async =>
      _doc(_api.post('/vendor-bills/$id/submit', headers: _idempotencyHeaders()),
          VendorBill.fromJson);

  Future<VendorBill> approveBill(String id) async =>
      _doc(_api.post('/vendor-bills/$id/approve', headers: _idempotencyHeaders()),
          VendorBill.fromJson);

  Future<VendorBill> postBill(String id) async =>
      _doc(_api.post('/vendor-bills/$id/post', headers: _idempotencyHeaders()),
          VendorBill.fromJson);

  // ── Vendor payments ────────────────────────────────────────────────────────
  Future<List<VendorPayment>> vendorPayments() async =>
      _list(_api.get('/vendor-payments'), VendorPayment.fromJson);

  Future<VendorPayment> createVendorPayment({
    required String vendorId,
    required double amount,
    required String method,
    String? bankAccountId,
    required List<Map<String, dynamic>> allocations,
  }) async {
    final result = await _api.post(
      '/vendor-payments',
      body: {
        'vendorId': vendorId,
        'amount': amount,
        'method': method,
        'bankAccountId': ?bankAccountId,
        'allocations': allocations,
      },
      headers: _idempotencyHeaders(),
    );
    return VendorPayment.fromJson(result.data);
  }

  Future<VendorPayment> capturePayment(
    String id, {
    required List<Map<String, dynamic>> allocations,
  }) async =>
      _doc(
        _api.post(
          '/vendor-payments/$id/capture',
          body: {'allocations': allocations},
          headers: _idempotencyHeaders(),
        ),
        VendorPayment.fromJson,
      );

  Future<VendorPayment> voidPayment(String id) async =>
      _doc(_api.post('/vendor-payments/$id/void', headers: _idempotencyHeaders()),
          VendorPayment.fromJson);

  // ── Helpers ────────────────────────────────────────────────────────────────
  Map<String, String> _idempotencyHeaders() => {
        'Idempotency-Key': _randomUuid(),
      };

  String _randomUuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  Future<List<T>> _list<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final result = await call;
    final raw = result.raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<T> _doc<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final result = await call;
    return fromJson(result.data);
  }
}