import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'ops_models.dart';
import 'ops_repository.dart';

/// Provider wiring for the Phase 8 ops module. Plain providers (no @riverpod
/// codegen) mirroring the other core domains.
final opsRepositoryProvider = Provider<OpsRepository>(
  (ref) => OpsRepository(ref.watch(apiClientProvider)),
);

final projectsProvider = FutureProvider<List<Project>>(
  (ref) => ref.watch(opsRepositoryProvider).projects(),
);

final tasksProvider = FutureProvider<List<ProjectTask>>(
  (ref) => ref.watch(opsRepositoryProvider).tasks(),
);

final approvalsInboxProvider = FutureProvider<List<ApprovalRequest>>(
  (ref) => ref.watch(opsRepositoryProvider).approvals(scope: 'inbox'),
);

final notificationsProvider = FutureProvider<List<AppNotification>>(
  (ref) => ref.watch(opsRepositoryProvider).notifications(),
);

final unreadNotificationsProvider = FutureProvider<int>(
  (ref) => ref.watch(opsRepositoryProvider).unreadCount(),
);

final kpisProvider = FutureProvider<DashboardKpis>(
  (ref) => ref.watch(opsRepositoryProvider).kpis(),
);

final salesTrendProvider = FutureProvider<List<SalesTrendPoint>>(
  (ref) => ref.watch(opsRepositoryProvider).salesTrend(interval: 'month'),
);