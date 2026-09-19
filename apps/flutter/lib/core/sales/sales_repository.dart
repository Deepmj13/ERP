import '../network/api_client.dart';
import '../network/idempotency.dart';
import 'sales_models.dart';

/// Talks to the `/quotations`, `/sales-orders`, `/deliveries`, `/invoices`,
/// `/payments` and `/bank-accounts` resources plus the master-data pickers used
/// by the sales forms. Every mutating call carries a fresh Idempotency-Key
/// (plan §16a). List endpoints return `{ data: [...] }`; the parser exposes the
/// raw list via [ApiResult.raw].
class SalesRepository {
  SalesRepository(this._api);

  final ApiClient _api;

  // ── Pickers (master data) ──────────────────────────────────────────────────
  Future<List<CustomerRef>> customers() async =>
      _list(_api.get('/customers'), CustomerRef.fromJson);

  Future<List<ProductRef>> products() async =>
      _list(_api.get('/products'), ProductRef.fromJson);

  Future<List<UnitRef>> units() async => _list(_api.get('/units'), UnitRef.fromJson);

  Future<List<TaxRateRef>> taxRates() async =>
      _list(_api.get('/tax-rates'), TaxRateRef.fromJson);

  Future<List<WarehouseRef>> warehouses() async =>
      _list(_api.get('/warehouses'), WarehouseRef.fromJson);

  Future<List<BankAccount>> bankAccounts() async =>
      _list(_api.get('/bank-accounts'), BankAccount.fromJson);

  // ── Quotations ─────────────────────────────────────────────────────────────
  Future<List<Quotation>> quotations() async =>
      _list(_api.get('/quotations'), Quotation.fromJson);

  Future<Map<String, dynamic>> quotation(String id) async =>
      (await _api.get('/quotations/$id')).data;

  Future<Quotation> createQuotation({
    required String customerId,
    String? currency,
    String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/quotations',
      body: {
        'customerId': customerId,
        'currency': ?currency,
        'notes': ?notes,
        'items': items,
      },
      headers: idempotencyHeaders(),
    );
    return Quotation.fromJson(result.data);
  }

  Future<dynamic> quoteAction(String id, String action) async {
    final result = await _api.post('/quotations/$id/$action', headers: idempotencyHeaders());
    return result.data;
  }

  // ── Sales orders ───────────────────────────────────────────────────────────
  Future<List<SalesOrder>> salesOrders() async =>
      _list(_api.get('/sales-orders'), SalesOrder.fromJson);

  Future<Map<String, dynamic>> salesOrder(String id) async =>
      (await _api.get('/sales-orders/$id')).data;

  Future<SalesOrder> createSalesOrder({
    required String customerId,
    String? currency,
    String? notes,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/sales-orders',
      body: {'customerId': customerId, 'currency': ?currency, 'notes': ?notes, 'items': items},
      headers: idempotencyHeaders(),
    );
    return SalesOrder.fromJson(result.data);
  }

  Future<dynamic> orderAction(String id, String action) async {
    final result = await _api.post('/sales-orders/$id/$action', headers: idempotencyHeaders());
    return result.data;
  }

  // ── Deliveries ─────────────────────────────────────────────────────────────
  Future<List<Delivery>> deliveries() async =>
      _list(_api.get('/deliveries'), Delivery.fromJson);

  Future<Map<String, dynamic>> delivery(String id) async =>
      (await _api.get('/deliveries/$id')).data;

  Future<Delivery> createDelivery({
    required String salesOrderId,
    String? warehouseId,
    required List<Map<String, dynamic>> items,
  }) async {
    final result = await _api.post(
      '/deliveries',
      body: {
        'salesOrderId': salesOrderId,
        'warehouseId': ?warehouseId,
        'items': items,
      },
      headers: idempotencyHeaders(),
    );
    return Delivery.fromJson(result.data);
  }

  Future<dynamic> deliveryAction(String id, String action) async {
    final result = await _api.post('/deliveries/$id/$action', headers: idempotencyHeaders());
    return result.data;
  }

  // ── Invoices ───────────────────────────────────────────────────────────────
  Future<List<Invoice>> invoices({String? customerId}) async =>
      _list(
        _api.get('/invoices', query: {'customer_id': ?customerId}),
        Invoice.fromJson,
      );

  Future<Map<String, dynamic>> invoice(String id) async =>
      (await _api.get('/invoices/$id')).data;

  Future<Invoice> createInvoice({
    required String customerId,
    required String issueDate,
    required List<Map<String, dynamic>> items,
    String? currency,
    String? dueDate,
    String? notes,
  }) async {
    final result = await _api.post(
      '/invoices',
      body: {
        'customerId': customerId,
        'issueDate': issueDate,
        'currency': ?currency,
        'dueDate': ?dueDate,
        'notes': ?notes,
        'items': items,
      },
      headers: idempotencyHeaders(),
    );
    return Invoice.fromJson(result.data);
  }

  Future<dynamic> invoiceAction(String id, String action) async {
    final result = await _api.post('/invoices/$id/$action', headers: idempotencyHeaders());
    return result.data;
  }

  Future<bool> invoicePdf(String id) async =>
      (await _api.post('/invoices/$id/pdf', headers: idempotencyHeaders())).raw == true;

  // ── Payments ───────────────────────────────────────────────────────────────
  Future<List<Payment>> payments({String? customerId}) async =>
      _list(
        _api.get('/payments', query: {'customer_id': ?customerId}),
        Payment.fromJson,
      );

  Future<Map<String, dynamic>> payment(String id) async =>
      (await _api.get('/payments/$id')).data;

  Future<Payment> createPayment({
    required String customerId,
    required double amount,
    required String method,
    String? reference,
    required List<Map<String, dynamic>> allocations,
  }) async {
    final result = await _api.post(
      '/payments',
      body: {
        'customerId': customerId,
        'amount': amount,
        'method': method,
        'reference': ?reference,
        'allocations': allocations,
      },
      headers: idempotencyHeaders(),
    );
    return Payment.fromJson(result.data);
  }

  Future<Payment> capturePayment(String id, {required List<Map<String, dynamic>> allocations}) async {
    final result = await _api.post(
      '/payments/$id/capture',
      body: {'allocations': allocations},
      headers: idempotencyHeaders(),
    );
    return Payment.fromJson(result.data);
  }

  Future<Payment> voidPayment(String id) async {
    final result = await _api.post('/payments/$id/void', headers: idempotencyHeaders());
    return Payment.fromJson(result.data);
  }

  // ── Bank accounts ──────────────────────────────────────────────────────────
  Future<BankAccount> createBankAccount({
    required String name,
    String? accountNumber,
    String? accountName,
    String? currency,
    double? openingBalance,
  }) async {
    final result = await _api.post(
      '/bank-accounts',
      body: {
        'name': name,
        'accountNumber': ?accountNumber,
        'accountName': ?accountName,
        'currency': ?currency,
        'openingBalance': ?openingBalance,
      },
      headers: idempotencyHeaders(),
    );
    return BankAccount.fromJson(result.data);
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