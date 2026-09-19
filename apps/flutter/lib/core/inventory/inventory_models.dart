/// Hand-written DTOs mirroring the Phase 4 inventory resources
/// (apps/api/src/inventory/*). Tolerant `fromJson` factories and decimal
/// normalization via [_asDouble].
library;

class Warehouse {
  const Warehouse({
    required this.id,
    required this.code,
    required this.name,
    this.isActive = true,
  });

  final String id;
  final String code;
  final String name;
  final bool isActive;

  factory Warehouse.fromJson(Map<String, dynamic> json) => Warehouse(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        isActive: json['isActive'] as bool? ?? true,
      );
}

class StockBalance {
  const StockBalance({
    required this.warehouseId,
    required this.productId,
    this.quantity = 0,
    this.reservedQty = 0,
    this.available = 0,
    this.productName,
    this.sku,
    this.warehouseName,
  });

  final String warehouseId;
  final String productId;
  final double quantity;
  final double reservedQty;
  final double available;
  final String? productName;
  final String? sku;
  final String? warehouseName;

  String get key => '$warehouseId-$productId';

  factory StockBalance.fromJson(Map<String, dynamic> json) => StockBalance(
        warehouseId: json['warehouseId'] as String? ?? '',
        productId: json['productId'] as String? ?? '',
        quantity: _asDouble(json['quantity']),
        reservedQty: _asDouble(json['reservedQty']),
        available: _asDouble(json['available']),
        productName: _nameOf(json['product']) ?? json['productName'] as String?,
        sku: json['product'] is Map<String, dynamic>
            ? (json['product'] as Map<String, dynamic>)['sku'] as String?
            : (json['productSku'] as String?),
        warehouseName: _nameOf(json['warehouse']) ?? json['warehouseName'] as String?,
      );
}

class StockMovement {
  const StockMovement({
    required this.id,
    required this.productId,
    required this.type,
    required this.quantity,
    this.warehouseId,
    this.referenceType,
    this.referenceId,
    this.reason,
    this.balanceAfter = 0,
    this.createdAt,
    this.productName,
    this.sku,
    this.warehouseName,
  });

  final String id;
  final String productId;
  final String type;
  final double quantity;
  final String? warehouseId;
  final String? referenceType;
  final String? referenceId;
  final String? reason;
  final double balanceAfter;
  final String? createdAt;
  final String? productName;
  final String? sku;
  final String? warehouseName;

  factory StockMovement.fromJson(Map<String, dynamic> json) => StockMovement(
        id: json['id'] as String? ?? '',
        productId: json['productId'] as String? ?? '',
        type: json['type'] as String? ?? '',
        quantity: _asDouble(json['quantity']),
        warehouseId: json['warehouseId'] as String?,
        referenceType: json['referenceType'] as String?,
        referenceId: json['referenceId'] as String?,
        reason: json['reason'] as String?,
        balanceAfter: _asDouble(json['balanceAfter']),
        createdAt: json['createdAt'] as String?,
        productName: _nameOf(json['product']) ?? json['productName'] as String?,
        sku: json['product'] is Map<String, dynamic>
            ? (json['product'] as Map<String, dynamic>)['sku'] as String?
            : (json['productSku'] as String?),
        warehouseName: _nameOf(json['warehouse']) ?? json['warehouseName'] as String?,
      );
}

class SerialNumber {
  const SerialNumber({
    required this.id,
    required this.serialNo,
    required this.status,
    this.productId,
    this.batchId,
    this.productName,
    this.sku,
  });

  final String id;
  final String serialNo;
  final String status;
  final String? productId;
  final String? batchId;
  final String? productName;
  final String? sku;

  factory SerialNumber.fromJson(Map<String, dynamic> json) => SerialNumber(
        id: json['id'] as String? ?? '',
        serialNo: json['serialNo'] as String? ?? '',
        status: json['status'] as String? ?? 'IN_STOCK',
        productId: json['productId'] as String?,
        batchId: json['batchId'] as String?,
        productName: _nameOf(json['product']) ?? json['productName'] as String?,
        sku: json['product'] is Map<String, dynamic>
            ? (json['product'] as Map<String, dynamic>)['sku'] as String?
            : (json['productSku'] as String?),
      );
}

class Batch {
  const Batch({
    required this.id,
    required this.batchNo,
    this.productId,
    this.expiryDate,
    this.manufacturedDate,
    this.quantityRemaining = 0,
    this.productName,
    this.sku,
  });

  final String id;
  final String batchNo;
  final String? productId;
  final String? expiryDate;
  final String? manufacturedDate;
  final double quantityRemaining;
  final String? productName;
  final String? sku;

  factory Batch.fromJson(Map<String, dynamic> json) => Batch(
        id: json['id'] as String? ?? '',
        batchNo: json['batchNo'] as String? ?? '',
        productId: json['productId'] as String?,
        expiryDate: json['expiryDate'] as String?,
        manufacturedDate: json['manufacturedDate'] as String?,
        quantityRemaining: _asDouble(json['quantityRemaining']),
        productName: _nameOf(json['product']) ?? json['productName'] as String?,
        sku: json['product'] is Map<String, dynamic>
            ? (json['product'] as Map<String, dynamic>)['sku'] as String?
            : (json['productSku'] as String?),
      );
}

String? _nameOf(dynamic relation) =>
    relation is Map<String, dynamic> ? relation['name'] as String? : null;

double _asDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s) ?? 0,
      _ => 0,
    };