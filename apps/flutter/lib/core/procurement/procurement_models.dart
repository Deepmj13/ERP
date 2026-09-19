/// Hand-written DTOs mirroring the backend procurement resources
/// (apps/api/src/procurement/*). Factory `fromJson` is tolerant of missing
/// keys so pages stay resilient to response shape changes.
library;

class Vendor {
  const Vendor({
    required this.id,
    required this.name,
    this.code,
    this.email,
    this.taxId,
    this.currency,
    this.paymentTerms,
    this.isActive = true,
  });

  final String id;
  final String name;
  final String? code;
  final String? email;
  final String? taxId;
  final String? currency;
  final String? paymentTerms;
  final bool isActive;

  factory Vendor.fromJson(Map<String, dynamic> json) => Vendor(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        code: json['code'] as String?,
        email: json['email'] as String?,
        taxId: json['taxId'] as String?,
        currency: json['currency'] as String?,
        paymentTerms: json['paymentTerms'] as String?,
        isActive: json['isActive'] as bool? ?? true,
      );
}

class PurchaseRequest {
  const PurchaseRequest({
    required this.id,
    required this.status,
    this.number,
    this.requestedDate,
    this.notes,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? requestedDate;
  final String? notes;
  final int itemCount;

  factory PurchaseRequest.fromJson(Map<String, dynamic> json) => PurchaseRequest(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        requestedDate: json['requestedDate'] as String?,
        notes: json['notes'] as String?,
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class PurchaseOrder {
  const PurchaseOrder({
    required this.id,
    required this.status,
    this.number,
    this.vendorName,
    this.currency,
    this.total = 0,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? vendorName;
  final String? currency;
  final double total;
  final int itemCount;

  factory PurchaseOrder.fromJson(Map<String, dynamic> json) => PurchaseOrder(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        vendorName: json['vendor'] is Map<String, dynamic>
            ? (json['vendor'] as Map<String, dynamic>)['name'] as String?
            : null,
        currency: json['currency'] as String?,
        total: _asDouble(json['total']),
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class GoodsReceipt {
  const GoodsReceipt({
    required this.id,
    required this.status,
    this.number,
    this.orderNumber,
    this.receiptDate,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? orderNumber;
  final String? receiptDate;
  final int itemCount;

  factory GoodsReceipt.fromJson(Map<String, dynamic> json) => GoodsReceipt(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        orderNumber: json['purchaseOrder'] is Map<String, dynamic>
            ? (json['purchaseOrder'] as Map<String, dynamic>)['number'] as String?
            : null,
        receiptDate: json['receiptDate'] as String?,
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class VendorBill {
  const VendorBill({
    required this.id,
    required this.status,
    this.number,
    this.vendorId,
    this.vendorName,
    this.issueDate,
    this.total = 0,
    this.balance = 0,
    this.itemCount = 0,
  });

  final String id;
  final String status;
  final String? number;
  final String? vendorId;
  final String? vendorName;
  final String? issueDate;
  final double total;
  final double balance;
  final int itemCount;

  factory VendorBill.fromJson(Map<String, dynamic> json) => VendorBill(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        number: json['number'] as String?,
        vendorId: json['vendor'] is Map<String, dynamic>
            ? (json['vendor'] as Map<String, dynamic>)['id'] as String?
            : null,
        vendorName: json['vendor'] is Map<String, dynamic>
            ? (json['vendor'] as Map<String, dynamic>)['name'] as String?
            : null,
        issueDate: json['issueDate'] as String?,
        total: _asDouble(json['total']),
        balance: _asDouble(json['balance']),
        itemCount: (json['items'] as List<dynamic>?)?.length ?? 0,
      );
}

class VendorPayment {
  const VendorPayment({
    required this.id,
    required this.status,
    this.number,
    this.vendorName,
    this.amount = 0,
    this.paidAt,
  });

  final String id;
  final String status;
  final String? number;
  final String? vendorName;
  final double amount;
  final String? paidAt;

  factory VendorPayment.fromJson(Map<String, dynamic> json) => VendorPayment(
        id: json['id'] as String? ?? '',
        status: json['status'] as String? ?? 'PENDING',
        number: json['number'] as String?,
        vendorName: json['vendor'] is Map<String, dynamic>
            ? (json['vendor'] as Map<String, dynamic>)['name'] as String?
            : null,
        amount: _asDouble(json['amount']),
        paidAt: json['paidAt'] as String?,
      );
}

double _asDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s) ?? 0,
      _ => 0,
    };