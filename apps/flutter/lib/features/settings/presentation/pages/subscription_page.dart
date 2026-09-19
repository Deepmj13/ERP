import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/settings/settings_providers.dart';
import '../../../../core/widgets/common.dart';

class SubscriptionPage extends ConsumerWidget {
  const SubscriptionPage({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(subscriptionProvider);
    ref.invalidate(usageLimitsProvider);
  }

  Future<void> _cancel(BuildContext context, WidgetRef ref) => runAction(
        context,
        () async {
          await ref.read(settingsRepositoryProvider).cancel();
          await _refresh(ref);
        },
        success: 'Subscription cancelled',
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subscription = ref.watch(subscriptionProvider);
    final usage = ref.watch(usageLimitsProvider);
    final sub = subscription.valueOrNull;
    final u = usage.valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription'),
        actions: [
          TextButton(onPressed: () => _refresh(ref), child: const Text('Refresh')),
        ],
      ),
      body: switch (subscription) {
        AsyncValue(:final error?) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 40),
                const SizedBox(height: 8),
                Text('$error'),
                const SizedBox(height: 8),
                FilledButton(onPressed: () => _refresh(ref), child: const Text('Retry')),
              ],
            ),
          ),
        AsyncValue(value: null) => const Center(child: CircularProgressIndicator()),
        _ => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (sub != null) ...[
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                sub.plan?['name']?.toString() ?? sub.planCode.toUpperCase(),
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                            ),
                            StatusChip(sub.status),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          sub.planCode,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${_priceLabel(sub.plan?['price'])} / ${sub.interval.toLowerCase()}',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        if (sub.trialEndsAt != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Trial ends ${_dateLabel(sub.trialEndsAt!)}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: 16),
                        FilledButton.tonal(
                          onPressed: () => context.go('/app/settings/plans'),
                          child: const Text('Change plan'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text('Usage limits', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (u != null)
                  Row(
                    children: [
                      _UsageCard(
                        label: 'Users',
                        current: u.currentOf('users'),
                        limit: u.limitOf('users'),
                      ),
                      _UsageCard(
                        label: 'Documents',
                        current: u.currentOf('documents'),
                        limit: u.limitOf('documents'),
                      ),
                    ],
                  ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => _cancel(context, ref),
                  style: TextButton.styleFrom(foregroundColor: Colors.red.shade700),
                  child: const Text('Cancel subscription'),
                ),
              ],
            ],
          ),
      },
    );
  }

  String _priceLabel(Object? price) {
    if (price is num) {
      return price == 0 ? 'Free' : '\$${price.toStringAsFixed(0)}';
    }
    return '\$0';
  }

  String _dateLabel(DateTime value) =>
      '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.label, this.current, this.limit});

  final String label;
  final double? current;
  final double? limit;

  @override
  Widget build(BuildContext context) {
    final c = current ?? 0;
    final l = limit;
    final atLimit = l != null && c >= l;
    return Expanded(
      child: Card(
        color: atLimit ? Colors.red.shade50 : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 6),
              Text(
                l == null ? '${c.toInt()} / unlimited' : '${c.toInt()} / ${l.toInt()}',
                style: atLimit
                    ? const TextStyle(color: Colors.red, fontWeight: FontWeight.bold)
                    : Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
        ),
      ),
    );
  }
}