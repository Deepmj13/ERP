import '../network/api_client.dart';
import '../network/idempotency.dart';
import 'ops_models.dart';

/// Phase 8 operations resources: `/projects`, `/tasks`, `/approvals`,
/// `/notifications` and the dashboard KPI endpoints. Mutating calls carry a
/// fresh Idempotency-Key like the other domains. List endpoints return the raw
/// array under `data`; notifications is paginated and nested under `items`.
class OpsRepository {
  OpsRepository(this._api);

  final ApiClient _api;

  // ── Projects ───────────────────────────────────────────────────────────────
  Future<List<Project>> projects({String? status}) async =>
      _list(
        _api.get('/projects', query: {'status': ?status}),
        Project.fromJson,
      );

  Future<Map<String, dynamic>> project(String id) async =>
      (await _api.get('/projects/$id')).data;

  Future<Project> createProject({
    required String code,
    required String name,
    String? customerId,
    String? status,
    String? startDate,
    String? endDate,
    double? budget,
  }) async {
    final result = await _api.post(
      '/projects',
      body: {
        'code': code,
        'name': name,
        'customerId': ?customerId,
        'status': ?status,
        'startDate': ?startDate,
        'endDate': ?endDate,
        'budget': ?budget,
      },
      headers: idempotencyHeaders(),
    );
    return Project.fromJson(result.data);
  }

  Future<dynamic> updateProject(String id, Map<String, dynamic> patch) async {
    final result = await _api.patch('/projects/$id', body: patch, headers: idempotencyHeaders());
    return result.data;
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  Future<List<ProjectTask>> tasks({String? projectId, String? status, String? priority}) async =>
      _list(
        _api.get('/tasks', query: {'project_id': ?projectId, 'status': ?status, 'priority': ?priority}),
        ProjectTask.fromJson,
      );

  Future<ProjectTask> createTask({
    required String projectId,
    required String title,
    String? assigneeId,
    String? description,
    String? status,
    String? priority,
    String? dueDate,
  }) async {
    final result = await _api.post(
      '/tasks',
      body: {
        'projectId': projectId,
        'title': title,
        'assigneeId': ?assigneeId,
        'description': ?description,
        'status': ?status,
        'priority': ?priority,
        'dueDate': ?dueDate,
      },
      headers: idempotencyHeaders(),
    );
    return ProjectTask.fromJson(result.data);
  }

  Future<dynamic> setTaskStatus(String id, String status) async {
    final result = await _api.post(
      '/tasks/$id/status',
      body: {'status': status},
      headers: idempotencyHeaders(),
    );
    return result.data;
  }

  // ── Approvals ──────────────────────────────────────────────────────────────
  Future<List<ApprovalRequest>> approvals({String scope = 'inbox'}) async =>
      _list(
        _api.get('/approvals', query: {'scope': scope}),
        ApprovalRequest.fromJson,
      );

  Future<dynamic> decideApproval(String id, String action, {String? comment}) async {
    final result = await _api.post(
      '/approval-requests/$id/$action',
      body: {'comment': ?comment},
      headers: idempotencyHeaders(),
    );
    return result.data;
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  Future<List<AppNotification>> notifications({bool unreadOnly = false}) async {
    final data = (await _api.get('/notifications', query: {'unread_only': unreadOnly}))
        .data;
    final items = data['items'];
    if (items is! List<dynamic>) return const [];
    return items
        .whereType<Map>()
        .map((e) => AppNotification.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<int> unreadCount() async {
    final data = (await _api.get('/notifications/unread-count')).data;
    return (data['count'] as num?)?.toInt() ?? 0;
  }

  Future<dynamic> markAllRead() async =>
      (await _api.post('/notifications/read-all', headers: idempotencyHeaders())).data;

  // ── Dashboard ──────────────────────────────────────────────────────────────
  Future<DashboardKpis> kpis() async =>
      DashboardKpis.fromJson((await _api.get('/dashboard/kpis')).data);

  Future<List<SalesTrendPoint>> salesTrend({String interval = 'month'}) async {
    final result = await _api.get('/dashboard/sales-trend', query: {'interval': interval});
    final raw = result.raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => SalesTrendPoint.fromJson(Map<String, dynamic>.from(e)))
        .toList();
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