import '../network/api_client.dart';
import '../network/idempotency.dart';
import 'settings_models.dart';

/// Phase 9 SaaS resources: `/plans`, `/subscription`, `/billing`, `/usage`.
/// Mutating calls carry a fresh Idempotency-Key like every other domain.
class SettingsRepository {
  SettingsRepository(this._api);

  final ApiClient _api;

  Future<List<SubscriptionPlan>> plans({String? interval}) async {
    final result = await _api.get('/plans', query: {'interval': ?interval});
    final raw = result.raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => SubscriptionPlan.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<SubscriptionInfo> subscription() async =>
      SubscriptionInfo.fromJson((await _api.get('/subscription')).data);

  Future<SubscriptionInfo> changePlan(String planCode) async {
    final result = await _api.post(
      '/subscription/change',
      body: {'planCode': planCode},
      headers: idempotencyHeaders(),
    );
    return SubscriptionInfo.fromJson(result.data);
  }

  Future<dynamic> cancel() async =>
      (await _api.post('/subscription/cancel', headers: idempotencyHeaders())).data;

  Future<CheckoutSession> checkout(String planCode, {String? interval}) async {
    final result = await _api.post(
      '/billing/checkout-session',
      body: {'planCode': planCode, 'interval': ?interval},
      headers: idempotencyHeaders(),
    );
    return CheckoutSession.fromJson(result.data);
  }

  Future<List<Map<String, dynamic>>> checkoutSessions() async {
    final raw = (await _api.get('/billing/sessions')).raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<UsageLimits> usageLimits() async =>
      UsageLimits.fromJson((await _api.get('/usage/limits')).data);

  Future<List<Map<String, dynamic>>> usageCurrent() async {
    final raw = (await _api.get('/usage/current')).raw;
    if (raw is! List<dynamic>) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
}