/// Hand-written DTOs mirroring the Phase 3 sales resources
/// (apps/api/src/sales/*). Factory `fromJson` is tolerant of missing keys so
/// pages stay resilient to response shape changes. Decimal amounts arrive as
/// strings or numbers from Prisma — normalize via [_asDouble].
library;

class CustomerRef {
  const CustomerRef({required this.id, required this.name});

  final String id;
  final String name;

  factory CustomerRef.fromJson(Map<String, dynamic> json) => CustomerRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
      );
}

class ProductRef {
  const ProductRef({required this.id, required this.name, this.sku, this.salePrice = 0});

  final String id;
  final String name;
  final String? sku;
  final double salePrice;

  factory ProductRef.fromJson(Map<String, dynamic> json) => ProductRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        sku: json['sku'] as String?,
        salePrice: _asDouble(json['salePrice']),
      );
}

class UnitRef {
  const UnitRef({required this.id, required this.name, this.code});

  final String id;
  final String name;
  final String? code;

  factory UnitRef.fromJson(Map<String, dynamic> json) => UnitRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        code: json['code'] as String?,
      );
}

class TaxRateRef {
  const TaxRateRef({required this.id, required this.code, required this.name, this.rate = 0});

  final String id;
  final String code;
  final String name;
  final double rate;

  factory TaxRateRef.fromJson(Map<String, dynamic> json) => TaxRateRef(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        rate: _asDouble(json['rate']),
      );
}

class WarehouseRef {
  const WarehouseRef({required this.id, required this.name, this.code});

  final String id;
  final String name;
  final String? code;

  factory WarehouseRef.fromJson(Map<String, dynamic> json) => WarehouseRef(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        code: json['code'] as String?,
      );
}

class BankAccount {
  const BankAccount({
    required this.id,
    required this.name,
    this.accountNumber,
    this.accountName,
    this.currency = 'USD',
    this.openingBalance = 0,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? accountNumber;
  final String? accountName;
  final String currency;
  final double openingBalance;
  final bool isActive;

  factory BankAccount.fromJson(Map<String, dynamic> json) => BankAccount(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        accountNumber: json['accountNumber'] as String?,
        accountName: json['accountName'] as String?,
        currency: json['currency'] as String? ?? 'USD',
        openingBalance: _asDouble(json['openingBalance']),
        isActive: json['isActive'] as bool? ?? true,
      );
}

class SalesItem {
  const SalesItem({
    this.productId,
    required this.description,
    this.quantity = 0,
    this.unitId,
    this.unitPrice = 0,
    this.discountPct = 0,
    this.taxRateId,
    this.lineTotal = 0,
  });

  final String? productId;
  final String description;
  final double quantity;
  final String? unitId;
  final double unitPrice;
  final double discountPct;
  final String? taxRateId;
  final double lineTotal;

  factory SalesItem.fromJson(Map<String, dynamic> json) => SalesItem(
        productId: json['productId'] as String?,
        description: json['description'] as String? ?? '',
        quantity: _asDouble(json['quantity']),
        unitId: json['unitId'] as String?,
        unitPrice: _asDouble(json['unitPrice']),
        discountPct: _asDouble(json['discountPct']),
        taxRateId: json['taxRateId'] as String?,
        lineTotal: _asDouble(json['lineTotal']),
      );

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'description': description,
        'quantity': quantity,
        'unitId': unitId,
        'unitPrice': unitPrice,
        'discountPct': discountPct,
        'taxRateId': taxRateId,
      };
}

class Quotation {
  const Quotation({
    required this.id,
    required this.status,
    this.number,
    this.customerId,
    this.customerName,
    this.currency = 'USD',
    this.total = 0,
    this.subtotal = 0,
    this.taxTotal = 0,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? customerId;
  final String? customerName;
  final String currency;
  final double total;
  final double subtotal;
  final double taxTotal;
  final int itemCount;

  factory Quotation.fromJson(Map<String, dynamic> json) => Quotation(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        customerId: _idOf(json['customer']) ?? json['customerId'] as String?,
        customerName: _nameOf(json['customer']),
        currency: json['currency'] as String? ?? 'USD',
        total: _asDouble(json['total']),
        subtotal: _asDouble(json['subtotal']),
        taxTotal: _asDouble(json['taxTotal']),
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class SalesOrder {
  const SalesOrder({
    required this.id,
    required this.status,
    this.number,
    this.customerId,
    this.customerName,
    this.currency = 'USD',
    this.total = 0,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? customerId;
  final String? customerName;
  final String currency;
  final double total;
  final int itemCount;

  factory SalesOrder.fromJson(Map<String, dynamic> json) => SalesOrder(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        customerId: _idOf(json['customer']) ?? json['customerId'] as String?,
        customerName: _nameOf(json['customer']),
        currency: json['currency'] as String? ?? 'USD',
        total: _asDouble(json['total']),
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class Delivery {
  const Delivery({
    required this.id,
    required this.status,
    this.number,
    this.orderNumber,
    this.warehouseId,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? orderNumber;
  final String? warehouseId;
  final int itemCount;

  factory Delivery.fromJson(Map<String, dynamic> json) => Delivery(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        orderNumber: _nameOf(json['salesOrder'] != null
            ? {'id': '', 'name': json['salesOrder']['number']}
            : null),
        warehouseId: json['warehouseId'] as String?,
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class Invoice {
  const Invoice({
    required this.id,
    required this.status,
    this.number,
    this.customerId,
    this.customerName,
    this.currency = 'USD',
    this.total = 0,
    this.paidAmount = 0,
    this.balance = 0,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? customerId;
  final String? customerName;
  final String currency;
  final double total;
  final double paidAmount;
  final double balance;
  final int itemCount;

  bool get isOpenForAllocation => (status == 'POSTED' || status == 'PARTIALLY_PAID') && balance > 0;

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        customerId: _idOf(json['customer']) ?? json['customerId'] as String?,
        customerName: _nameOf(json['customer']),
        currency: json['currency'] as String? ?? 'USD',
        total: _asDouble(json['total']),
        paidAmount: _asDouble(json['paidAmount']),
        balance: _asDouble(json['balance']),
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class PaymentAllocation {
  const PaymentAllocation({required this.invoiceId, required this.amount, this.invoiceNumber});

  final String invoiceId;
  final double amount;
  final String? invoiceNumber;

  factory PaymentAllocation.fromJson(Map<String, dynamic> json) => PaymentAllocation(
        invoiceId: json['invoiceId'] as String? ?? '',
        amount: _asDouble(json['amount']),
        invoiceNumber: json['invoice'] is Map<String, dynamic>
            ? (json['invoice'] as Map<String, dynamic>)['number'] as String?
            : null,
      );
}

class Payment {
  const Payment({
    required this.id,
    required this.status,
    this.number,
    this.customerId,
    this.customerName,
    this.amount = 0,
    this.method,
    this.reference,
    this.paidAt,
    this.allocationCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? customerId;
  final String? customerName;
  final double amount;
  final String? method;
  final String? reference;
  final String? paidAt;
  final int allocationCount;

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'PENDING',
        number: json['number'] as String?,
        customerId: _idOf(json['customer']) ?? json['customerId'] as String?,
        customerName: _nameOf(json['customer']),
        amount: _asDouble(json['amount']),
        method: json['method'] as String?,
        reference: json['reference'] as String?,
        paidAt: json['paidAt'] as String?,
        allocationCount: (json['allocations'] as List<dynamic>?)?.length ?? 0,
      );
}

String? _idOf(dynamic relation) => relation is Map<String, dynamic> ? relation['id'] as String? : null;

String? _nameOf(dynamic relation) =>
    relation is Map<String, dynamic> ? relation['name'] as String? : null;

double _asDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s) ?? 0,
      _ => 0,
    };