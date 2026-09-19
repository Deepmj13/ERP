/// Phase 9 settings/billing domain models — mirrors the API envelope shapes
/// from apps/api/src/saas/* (plans, subscription, usage).
library;

class SubscriptionPlan {
  const SubscriptionPlan({
    required this.code,
    required this.name,
    required this.interval,
    required this.price,
    required this.currency,
    this.features = const {},
    this.limits = const {},
  });

  final String code;
  final String name;
  final String interval;
  final double price;
  final String currency;
  final Map<String, dynamic> features;
  final Map<String, dynamic> limits;

  factory SubscriptionPlan.fromJson(Map<String, dynamic> json) => SubscriptionPlan(
        code: json['code'] as String? ?? '',
        name: json['name'] as String? ?? '',
        interval: json['interval'] as String? ?? 'MONTHLY',
        price: (json['price'] as num?)?.toDouble() ?? 0,
        currency: json['currency'] as String? ?? 'USD',
        features: (json['features'] as Map?)?.map(
              (k, v) => MapEntry(k.toString(), v),
            ) ??
            const {},
        limits: (json['limits'] as Map?)?.map(
              (k, v) => MapEntry(k.toString(), v is num ? v.toDouble() : v),
            ) ??
            const {},
      );

  String get priceLabel =>
      price == 0 ? 'Free' : '\$${price.toStringAsFixed(price % 1 == 0 ? 0 : 2)}/$interval.toLowerCase()';
}

class SubscriptionInfo {
  const SubscriptionInfo({
    required this.subscriptionId,
    required this.planCode,
    required this.status,
    required this.interval,
    required this.currency,
    this.endsAt,
    this.trialEndsAt,
    this.plan,
  });

  final String subscriptionId;
  final String planCode;
  final String status;
  final String interval;
  final String currency;
  final DateTime? endsAt;
  final DateTime? trialEndsAt;
  final Map<String, dynamic>? plan;

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) => SubscriptionInfo(
        subscriptionId: json['subscriptionId'] as String? ?? '',
        planCode: json['planCode'] as String? ?? '',
        status: json['status'] as String? ?? '',
        interval: json['interval'] as String? ?? 'MONTHLY',
        currency: json['currency'] as String? ?? 'USD',
        endsAt: json['endsAt'] != null ? DateTime.tryParse(json['endsAt'] as String) : null,
        trialEndsAt:
            json['trialEndsAt'] != null ? DateTime.tryParse(json['trialEndsAt'] as String) : null,
        plan: json['plan'] is Map<String, dynamic> ? json['plan'] as Map<String, dynamic> : null,
      );

  bool get isTrial => status == 'TRIAL';
}

class UsageLimits {
  const UsageLimits({
    required this.limits,
    required this.current,
    required this.planCode,
    this.planName = '',
  });

  final Map<String, dynamic> limits;
  final Map<String, dynamic> current;
  final String planCode;
  final String planName;

  factory UsageLimits.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> asMap(Object? value) {
      if (value is Map) {
        return value.map((k, v) => MapEntry(
            k.toString(),
            v is num ? v.toDouble() : v?.toString()));
      }
      return const {};
    }

    final plan = (json['plan'] as Map?)?.map(
          (k, v) => MapEntry(k.toString(), v),
        ) ??
        const {};
    return UsageLimits(
      limits: asMap(json['limits']),
      current: asMap(json['current']),
      planCode: plan['code']?.toString() ?? '',
      planName: plan['name']?.toString() ?? '',
    );
  }

  double? limitOf(String metric) => (limits[metric] as num?)?.toDouble();
  double? currentOf(String metric) => (current[metric] as num?)?.toDouble();
}

class CheckoutSession {
  const CheckoutSession({required this.sessionId, required this.url});

  final String sessionId;
  final String url;

  factory CheckoutSession.fromJson(Map<String, dynamic> json) => CheckoutSession(
        sessionId: json['sessionId'] as String? ?? '',
        url: json['url'] as String? ?? '',
      );
}