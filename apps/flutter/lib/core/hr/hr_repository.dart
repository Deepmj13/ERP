import 'dart:math';
import 'dart:typed_data';

import '../network/api_client.dart';
import 'hr_models.dart';

/// Talks to the `/hr*` backend resources. All mutating calls carry a fresh
/// Idempotency-Key (backend rule: required on every mutating endpoint).
/// List endpoints return `{ data: [...] }`; the parser exposes the raw list
/// via [ApiResult.raw].
class HrRepository {
  HrRepository(this._api);

  final ApiClient _api;
  final Random _random = Random.secure();

  // ── Departments ────────────────────────────────────────────────────────────
  Future<List<Department>> departments() async =>
      _list(_api.get('/departments'), Department.fromJson);

  Future<Department> createDepartment({required String code, required String name}) async {
    final result = await _api.post(
      '/departments',
      body: {'code': code, 'name': name},
      headers: _idempotencyHeaders(),
    );
    return Department.fromJson(result.data);
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  Future<List<Employee>> employees() async =>
      _list(_api.get('/employees'), Employee.fromJson);

  Future<Employee> createEmployee({
    required String employeeNo,
    required String firstName,
    required String lastName,
    String? departmentId,
    String? jobTitle,
  }) async {
    final result = await _api.post(
      '/employees',
      body: {
        'employeeNo': employeeNo,
        'firstName': firstName,
        'lastName': lastName,
        'departmentId': ?departmentId,
        'jobTitle': ?jobTitle,
      },
      headers: _idempotencyHeaders(),
    );
    return Employee.fromJson(result.data);
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  Future<List<AttendanceRecord>> attendance() async =>
      _list(_api.get('/attendance'), AttendanceRecord.fromJson);

  Future<AttendanceRecord> punchAttendance({
    required String employeeId,
    required String workDate,
    String? checkIn,
    String? checkOut,
  }) async {
    final result = await _api.post(
      '/attendance/punch',
      body: {
        'employeeId': employeeId,
        'workDate': workDate,
        'checkIn': ?checkIn,
        'checkOut': ?checkOut,
      },
      headers: _idempotencyHeaders(),
    );
    return AttendanceRecord.fromJson(result.data);
  }

  // ── Leave types ────────────────────────────────────────────────────────────
  Future<List<LeaveType>> leaveTypes() async =>
      _list(_api.get('/leave-types'), LeaveType.fromJson);

  Future<LeaveType> createLeaveType({
    required String code,
    required String name,
    required double entitlementDays,
  }) async {
    final result = await _api.post(
      '/leave-types',
      body: {'code': code, 'name': name, 'entitlementDays': entitlementDays},
      headers: _idempotencyHeaders(),
    );
    return LeaveType.fromJson(result.data);
  }

  // ── Leaves ─────────────────────────────────────────────────────────────────
  Future<List<Leave>> leaves() async => _list(_api.get('/leaves'), Leave.fromJson);

  Future<List<Leave>> myLeaves() async =>
      _list(_api.get('/leaves/mine'), Leave.fromJson);

  Future<Leave> createLeave({
    required String employeeId,
    required String leaveTypeId,
    required String startDate,
    required String endDate,
    double? days,
    String? reason,
  }) async {
    final result = await _api.post(
      '/leaves',
      body: {
        'employeeId': employeeId,
        'leaveTypeId': leaveTypeId,
        'startDate': startDate,
        'endDate': endDate,
        'days': ?days,
        'reason': ?reason,
      },
      headers: _idempotencyHeaders(),
    );
    return Leave.fromJson(result.data);
  }

  Future<Leave> submitLeave(String id) async =>
      _doc(_api.post('/leaves/$id/submit', headers: _idempotencyHeaders()), Leave.fromJson);

  Future<Leave> approveLeave(String id) async =>
      _doc(_api.post('/leaves/$id/approve', headers: _idempotencyHeaders()), Leave.fromJson);

  Future<Leave> rejectLeave(String id) async =>
      _doc(_api.post('/leaves/$id/reject', headers: _idempotencyHeaders()), Leave.fromJson);

  Future<Leave> cancelLeave(String id) async =>
      _doc(_api.post('/leaves/$id/cancel', headers: _idempotencyHeaders()), Leave.fromJson);

  // ── Salary structures ──────────────────────────────────────────────────────
  Future<List<SalaryStructure>> salaryStructures() async =>
      _list(_api.get('/salary-structures'), SalaryStructure.fromJson);

  Future<SalaryStructure> createSalaryStructure({
    required String employeeId,
    required String effectiveDate,
    required double basicSalary,
    String? currency,
    String? payStructureNotes,
  }) async {
    final result = await _api.post(
      '/salary-structures',
      body: {
        'employeeId': employeeId,
        'effectiveDate': effectiveDate,
        'basicSalary': basicSalary,
        'currency': ?currency,
        'payStructureNotes': ?payStructureNotes,
      },
      headers: _idempotencyHeaders(),
    );
    return SalaryStructure.fromJson(result.data);
  }

  // ── Payroll runs ───────────────────────────────────────────────────────────
  Future<List<PayrollRun>> payrollRuns() async =>
      _list(_api.get('/payroll-runs'), PayrollRun.fromJson);

  Future<PayrollRun> payrollRun(String id) async =>
      _doc(_api.get('/payroll-runs/$id'), PayrollRun.fromJson);

  Future<PayrollRun> createPayrollRun({
    required String periodStart,
    required String periodEnd,
  }) async {
    final result = await _api.post(
      '/payroll-runs',
      body: {'periodStart': periodStart, 'periodEnd': periodEnd},
      headers: _idempotencyHeaders(),
    );
    return PayrollRun.fromJson(result.data);
  }

  Future<PayrollRun> calculatePayrollRun(String id) async =>
      _doc(_api.post('/payroll-runs/$id/calculate', headers: _idempotencyHeaders()), PayrollRun.fromJson);

  Future<PayrollRun> approvePayrollRun(String id) async =>
      _doc(_api.post('/payroll-runs/$id/approve', headers: _idempotencyHeaders()), PayrollRun.fromJson);

  Future<PayrollRun> postPayrollRun(String id) async =>
      _doc(_api.post('/payroll-runs/$id/post', headers: _idempotencyHeaders()), PayrollRun.fromJson);

  Future<PayrollRun> reversePayrollRun(String id) async =>
      _doc(_api.post('/payroll-runs/$id/reverse', headers: _idempotencyHeaders()), PayrollRun.fromJson);

  // ── Payslip PDFs ───────────────────────────────────────────────────────────
  Future<void> queuePayslipPdf(String id) async =>
      _api.post('/payslips/$id/pdf', headers: _idempotencyHeaders());

  Future<Uint8List> downloadPayslipPdf(String id) =>
      _api.downloadBytes('/payslips/$id/pdf/download');

  // ── Helpers ────────────────────────────────────────────────────────────────
  Map<String, String> _idempotencyHeaders() => {'Idempotency-Key': _randomUuid()};

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
    return raw.whereType<Map>().map((e) => fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<T> _doc<T>(Future<ApiResult> call, T Function(Map<String, dynamic>) fromJson) async {
    final result = await call;
    return fromJson(result.data);
  }
}