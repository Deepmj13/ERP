/// Hand-written DTOs mirroring the backend HR resources
/// (apps/api/src/hr/*). Factory `fromJson` is tolerant of missing keys so
/// pages stay resilient to response shape changes.
library;

class Department {
  const Department({required this.id, required this.code, required this.name, this.parentId});

  final String id;
  final String code;
  final String name;
  final String? parentId;

  factory Department.fromJson(Map<String, dynamic> json) => Department(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        parentId: json['parentId'] as String?,
      );
}

class Employee {
  const Employee({
    required this.id,
    required this.employeeNo,
    required this.firstName,
    required this.lastName,
    this.departmentId,
    this.departmentName,
    this.jobTitle,
    this.status = 'ACTIVE',
    this.email,
    this.phone,
  });

  final String id;
  final String employeeNo;
  final String firstName;
  final String lastName;
  final String? departmentId;
  final String? departmentName;
  final String? jobTitle;
  final String status;
  final String? email;
  final String? phone;

  String get fullName => '$firstName $lastName';

  factory Employee.fromJson(Map<String, dynamic> json) {
    final dept = json['department'];
    return Employee(
      id: json['id'] as String? ?? '',
      employeeNo: json['employeeNo'] as String? ?? '',
      firstName: json['firstName'] as String? ?? '',
      lastName: json['lastName'] as String? ?? '',
      departmentId: dept is Map<String, dynamic>
          ? dept['id'] as String?
          : json['departmentId'] as String?,
      departmentName: dept is Map<String, dynamic> ? dept['name'] as String? : null,
      jobTitle: json['jobTitle'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
    );
  }
}

class AttendanceRecord {
  const AttendanceRecord({
    required this.id,
    required this.employeeId,
    required this.workDate,
    this.checkIn,
    this.checkOut,
    this.status = 'PRESENT',
    this.employeeNo,
    this.employeeName,
  });

  final String id;
  final String employeeId;
  final String workDate;
  final String? checkIn;
  final String? checkOut;
  final String status;
  final String? employeeNo;
  final String? employeeName;

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    final employee = json['employee'];
    return AttendanceRecord(
      id: json['id'] as String? ?? '',
      employeeId: json['employeeId'] as String? ?? '',
      workDate: json['workDate'] as String? ?? '',
      checkIn: json['checkIn'] as String?,
      checkOut: json['checkOut'] as String?,
      status: json['status'] as String? ?? 'PRESENT',
      employeeNo: employee is Map<String, dynamic> ? employee['employeeNo'] as String? : null,
      employeeName: employee is Map<String, dynamic>
          ? '${employee['firstName'] ?? ''} ${employee['lastName'] ?? ''}'.trim()
          : null,
    );
  }
}

class LeaveType {
  const LeaveType({
    required this.id,
    required this.code,
    required this.name,
    this.entitlementDays = 0,
  });

  final String id;
  final String code;
  final String name;
  final double entitlementDays;

  factory LeaveType.fromJson(Map<String, dynamic> json) => LeaveType(
        id: json['id'] as String? ?? '',
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        entitlementDays: _asDouble(json['entitlementDays']),
      );
}

class Leave {
  const Leave({
    required this.id,
    required this.employeeId,
    required this.leaveTypeId,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.status,
    this.reason,
    this.employeeNo,
    this.employeeName,
    this.leaveTypeName,
  });

  final String id;
  final String employeeId;
  final String leaveTypeId;
  final String startDate;
  final String endDate;
  final double days;
  final String status;
  final String? reason;
  final String? employeeNo;
  final String? employeeName;
  final String? leaveTypeName;

  factory Leave.fromJson(Map<String, dynamic> json) {
    final employee = json['employee'];
    final leaveType = json['leaveType'];
    return Leave(
      id: json['id'] as String? ?? '',
      employeeId: json['employeeId'] as String? ?? '',
      leaveTypeId: json['leaveTypeId'] as String? ?? '',
      startDate: json['startDate'] as String? ?? '',
      endDate: json['endDate'] as String? ?? '',
      days: _asDouble(json['days']),
      status: json['status'] as String? ?? 'PENDING',
      reason: json['reason'] as String?,
      employeeNo: employee is Map<String, dynamic> ? employee['employeeNo'] as String? : null,
      employeeName: employee is Map<String, dynamic>
          ? '${employee['firstName'] ?? ''} ${employee['lastName'] ?? ''}'.trim()
          : null,
      leaveTypeName: leaveType is Map<String, dynamic> ? leaveType['name'] as String? : null,
    );
  }
}

double _asDouble(dynamic value) => switch (value) {
      num n => n.toDouble(),
      String s => double.tryParse(s) ?? 0,
      _ => 0,
    };

Map<String, dynamic> _asMap(dynamic value) =>
    value is Map<String, dynamic> ? value : const {};

class SalaryStructure {
  const SalaryStructure({
    required this.id,
    required this.employeeId,
    required this.effectiveDate,
    required this.basicSalary,
    this.currency = 'USD',
    this.allowances = const {},
    this.deductions = const {},
    this.payStructureNotes,
    this.isActive = true,
    this.employeeNo,
    this.employeeName,
  });

  final String id;
  final String employeeId;
  final String effectiveDate;
  final double basicSalary;
  final String currency;
  final Map<String, dynamic> allowances;
  final Map<String, dynamic> deductions;
  final String? payStructureNotes;
  final bool isActive;
  final String? employeeNo;
  final String? employeeName;

  double get totalAllowances =>
      allowances.values.fold(0, (sum, v) => sum + _componentAmount(v));

  double get totalDeductions =>
      deductions.values.fold(0, (sum, v) => sum + _componentAmount(v));

  factory SalaryStructure.fromJson(Map<String, dynamic> json) {
    final employee = json['employee'];
    return SalaryStructure(
      id: json['id'] as String? ?? '',
      employeeId: json['employeeId'] as String? ?? '',
      effectiveDate: json['effectiveDate'] as String? ?? '',
      basicSalary: _asDouble(json['basicSalary']),
      currency: json['currency'] as String? ?? 'USD',
      allowances: _asMap(json['allowances']),
      deductions: _asMap(json['deductions']),
      payStructureNotes: json['payStructureNotes'] as String?,
      isActive: json['isActive'] as bool? ?? true,
      employeeNo: employee is Map<String, dynamic> ? employee['employeeNo'] as String? : null,
      employeeName: employee is Map<String, dynamic>
          ? '${employee['firstName'] ?? ''} ${employee['lastName'] ?? ''}'.trim()
          : null,
    );
  }
}

class PayrollRun {
  const PayrollRun({
    required this.id,
    required this.number,
    required this.periodStart,
    required this.periodEnd,
    required this.status,
    required this.totalGross,
    required this.totalDeductions,
    required this.totalNet,
    this.payslipCount = 0,
    this.payslips = const [],
    this.approvedAt,
    this.postedAt,
    this.reversedAt,
  });

  final String id;
  final String number;
  final String periodStart;
  final String periodEnd;
  final String status;
  final double totalGross;
  final double totalDeductions;
  final double totalNet;
  final int payslipCount;
  final List<Payslip> payslips;
  final String? approvedAt;
  final String? postedAt;
  final String? reversedAt;

  String get periodLabel {
    final start = periodStart.toString().split('T').first;
    final end = periodEnd.toString().split('T').first;
    return '$start → $end';
  }

  factory PayrollRun.fromJson(Map<String, dynamic> json) {
    final count = json['_count'];
    final payslips = json['payslips'];
    return PayrollRun(
      id: json['id'] as String? ?? '',
      number: json['number'] as String? ?? '',
      periodStart: json['periodStart'] as String? ?? '',
      periodEnd: json['periodEnd'] as String? ?? '',
      status: json['status'] as String? ?? 'DRAFT',
      totalGross: _asDouble(json['totalGross']),
      totalDeductions: _asDouble(json['totalDeductions']),
      totalNet: _asDouble(json['totalNet']),
      approvedAt: json['approvedAt'] as String?,
      postedAt: json['postedAt'] as String?,
      reversedAt: json['reversedAt'] as String?,
      payslipCount: count is Map<String, dynamic> ? count['payslips'] as int? ?? 0 : 0,
      payslips: payslips is List<dynamic>
          ? payslips
              .whereType<Map>()
              .map((p) => Payslip.fromJson(Map<String, dynamic>.from(p)))
              .toList()
          : const [],
    );
  }
}

class Payslip {
  const Payslip({
    required this.id,
    required this.payrollRunId,
    required this.employeeId,
    required this.grossPay,
    required this.totalDeductions,
    required this.netPay,
    this.hasPdf = false,
    this.employeeNo,
    this.employeeName,
    this.earnings = const {},
    this.deductions = const {},
  });

  final String id;
  final String payrollRunId;
  final String employeeId;
  final double grossPay;
  final double totalDeductions;
  final double netPay;
  final bool hasPdf;
  final String? employeeNo;
  final String? employeeName;
  final Map<String, dynamic> earnings;
  final Map<String, dynamic> deductions;

  factory Payslip.fromJson(Map<String, dynamic> json) {
    final employee = json['employee'];
    final pdf = json['pdf'];
    return Payslip(
      id: json['id'] as String? ?? '',
      payrollRunId: json['payrollRunId'] as String? ?? '',
      employeeId: json['employeeId'] as String? ?? '',
      grossPay: _asDouble(json['grossPay']),
      totalDeductions: _asDouble(json['totalDeductions']),
      netPay: _asDouble(json['netPay']),
      hasPdf: pdf is Map<String, dynamic> && pdf['status'] == 'GENERATED',
      employeeNo: employee is Map<String, dynamic> ? employee['employeeNo'] as String? : null,
      employeeName: employee is Map<String, dynamic>
          ? '${employee['firstName'] ?? ''} ${employee['lastName'] ?? ''}'.trim()
          : null,
      earnings: _asMap(json['earnings']),
      deductions: _asMap(json['deductions']),
    );
  }
}

double _componentAmount(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  if (value is Map<String, dynamic>) {
    final amount = value['amount'];
    if (amount is num) return amount.toDouble();
    if (amount is String) return double.tryParse(amount) ?? 0;
    final inner = value['value'];
    if (inner is num) return inner.toDouble();
    if (inner is String) return double.tryParse(inner) ?? 0;
  }
  return 0;
}