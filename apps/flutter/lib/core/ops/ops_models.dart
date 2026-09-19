/// Hand-written DTOs mirroring the Phase 8 ops resources
/// (apps/api/src/ops/{projects,tasks,approvals,notifications,dashboard}).
/// Tolerant `fromJson` mirrors the other core domains; amounts arrive as
/// strings or numbers from Prisma and are normalized via [_asDouble].
library;

class Project {
  const Project({
    required this.id,
    required this.code,
    required this.name,
    this.status = 'ACTIVE',
    this.customerId,
    this.customerName,
    this.startDate,
    this.endDate,
    this.budget,
    this.taskCount = 0,
  });

  final String id;
  final String code;
  final String name;
  final String status;
  final String? customerId;
  final String? customerName;
  final String? startDate;
  final String? endDate;
  final double? budget;
  final int taskCount;

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        status: json['status'] as String? ?? 'ACTIVE',
        customerId: _idOf(json['customer']) ?? json['customerId'] as String?,
        customerName: _nameOf(json['customer']),
        startDate: json['startDate'] as String?,
        endDate: json['endDate'] as String?,
        budget: _nullableDouble(json['budget']),
        taskCount: (json['_count'] as Map<String, dynamic>?)?['tasks'] as int? ?? 0,
      );
}

class ProjectTask {
  const ProjectTask({
    required this.id,
    required this.title,
    this.projectId,
    this.projectName,
    this.projectCode,
    this.assigneeId,
    this.description,
    this.status = 'TODO',
    this.priority = 'MEDIUM',
    this.dueDate,
    this.createdAt,
  });

  final String id;
  final String title;
  final String? projectId;
  final String? projectName;
  final String? projectCode;
  final String? assigneeId;
  final String? description;
  final String status;
  final String priority;
  final String? dueDate;
  final String? createdAt;

  factory ProjectTask.fromJson(Map<String, dynamic> json) {
    final project = json['project'] is Map<String, dynamic>
        ? json['project'] as Map<String, dynamic>
        : null;
    return ProjectTask(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? '',
      projectId: json['projectId'] as String? ?? project?['id'] as String?,
      projectName: project?['name'] as String?,
      projectCode: project?['code'] as String?,
      assigneeId: json['assigneeId'] as String?,
      description: json['description'] as String?,
      status: json['status'] as String? ?? 'TODO',
      priority: json['priority'] as String? ?? 'MEDIUM',
      dueDate: json['dueDate'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }
}

class ApprovalRequest {
  const ApprovalRequest({
    required this.id,
    required this.objectType,
    required this.objectId,
    this.objectNumber,
    this.requestedById,
    this.approverId,
    this.status = 'PENDING',
    this.comment,
    this.createdAt,
    this.decidedAt,
  });

  final String id;
  final String objectType;
  final String objectId;
  final String? objectNumber;
  final String? requestedById;
  final String? approverId;
  final String status;
  final String? comment;
  final String? createdAt;
  final String? decidedAt;

  String get typeLabel => switch (objectType) {
        'QUOTATION' => 'Quotation',
        'SALES_ORDER' => 'Sales Order',
        'PURCHASE_REQUEST' => 'Purchase Request',
        'PURCHASE_ORDER' => 'Purchase Order',
        'LEAVE' => 'Leave request',
        'PAYROLL_RUN' => 'Payroll run',
        _ => objectType,
      };

  factory ApprovalRequest.fromJson(Map<String, dynamic> json) => ApprovalRequest(
        id: json['id'] as String? ?? '',
        objectType: json['objectType'] as String? ?? '',
        objectId: json['objectId'] as String? ?? '',
        objectNumber: json['objectNumber'] as String?,
        requestedById: json['requestedById'] as String?,
        approverId: json['approverId'] as String?,
        status: json['status'] as String? ?? 'PENDING',
        comment: json['comment'] as String?,
        createdAt: json['createdAt'] as String?,
        decidedAt: json['decidedAt'] as String?,
      );
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.title,
    this.type,
    this.body,
    this.readAt,
    this.createdAt,
    this.data,
  });

  final String id;
  final String title;
  final String? type;
  final String? body;
  final String? readAt;
  final String? createdAt;
  final Map<String, dynamic>? data;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? '',
        type: json['type'] as String?,
        body: json['body'] as String?,
        readAt: json['readAt'] as String?,
        createdAt: json['createdAt'] as String?,
        data: json['data'] is Map<String, dynamic>
            ? Map<String, dynamic>.from(json['data'] as Map<String, dynamic>)
            : null,
      );
}

class DashboardKpis {
  const DashboardKpis({
    this.revenue = 0,
    this.outstanding = 0,
    this.invoiced = 0,
    this.collected = 0,
    this.customers = 0,
    this.lowStockItems = 0,
    this.pendingApprovals = 0,
    this.pendingForMe = 0,
    this.openTasks = 0,
    this.currency = 'USD',
  });

  final double revenue;
  final double outstanding;
  final double invoiced;
  final double collected;
  final int customers;
  final int lowStockItems;
  final int pendingApprovals;
  final int pendingForMe;
  final int openTasks;
  final String currency;

  factory DashboardKpis.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] is Map<String, dynamic>
        ? json['totals'] as Map<String, dynamic>
        : <String, dynamic>{};
    return DashboardKpis(
      revenue: _asDouble(json['revenue']),
      outstanding: _asDouble(json['outstanding']),
      invoiced: _asDouble(totals['invoiced']),
      collected: _asDouble(totals['collected']),
      customers: (json['customers'] as num?)?.toInt() ?? 0,
      lowStockItems: (json['lowStockItems'] as num?)?.toInt() ?? 0,
      pendingApprovals: (json['pendingApprovals'] as num?)?.toInt() ?? 0,
      pendingForMe: (json['pendingForMe'] as num?)?.toInt() ?? 0,
      openTasks: (json['openTasks'] as num?)?.toInt() ?? 0,
      currency: json['currency'] as String? ?? 'USD',
    );
  }
}

class SalesTrendPoint {
  const SalesTrendPoint({this.bucket, this.count = 0, this.revenue = 0});

  final String? bucket;
  final int count;
  final double revenue;

  factory SalesTrendPoint.fromJson(Map<String, dynamic> json) => SalesTrendPoint(
        bucket: json['bucket']?.toString(),
        count: (json['count'] as num?)?.toInt() ?? 0,
        revenue: _asDouble(json['revenue']),
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

double? _nullableDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s),
      _ => null,
    };