import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import 'settings_models.dart';
import 'settings_repository.dart';

/// Provider wiring for the Phase 9 settings/billing module. Plain providers
/// (no @riverpod codegen) mirroring the other core domains.
final settingsRepositoryProvider = Provider<SettingsRepository>(
  (ref) => SettingsRepository(ref.watch(apiClientProvider)),
);

final plansProvider = FutureProvider<List<SubscriptionPlan>>(
  (ref) => ref.watch(settingsRepositoryProvider).plans(),
);

final subscriptionProvider = FutureProvider<SubscriptionInfo>(
  (ref) => ref.watch(settingsRepositoryProvider).subscription(),
);

final usageLimitsProvider = FutureProvider<UsageLimits>(
  (ref) => ref.watch(settingsRepositoryProvider).usageLimits(),
);