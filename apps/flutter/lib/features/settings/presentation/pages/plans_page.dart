import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/settings/settings_models.dart';
import '../../../../core/settings/settings_providers.dart';
import '../../../../core/widgets/common.dart';

class PlansPage extends ConsumerWidget {
  const PlansPage({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(plansProvider);
    ref.invalidate(subscriptionProvider);
  }

  Future<void> _switchTo(BuildContext context, WidgetRef ref, SubscriptionPlan plan) =>
      runAction(
        context,
        () async {
          await ref.read(settingsRepositoryProvider).changePlan(plan.code);
          await _refresh(ref);
        },
        success: 'Switched to ${plan.name}',
      );

  Future<void> _checkout(BuildContext context, WidgetRef ref, SubscriptionPlan plan) =>
      runAction(
        context,
        () async {
          final session = await ref.read(settingsRepositoryProvider).checkout(plan.code);
          if (!context.mounted) return;
          await showDialog<void>(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Checkout'),
              content: Text('Checkout session created:\n${session.url}'),
              actions: [
                TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
              ],
            ),
          );
          await _refresh(ref);
        },
        success: 'Checkout session created',
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plans = ref.watch(plansProvider);
    final subscription = ref.watch(subscriptionProvider);
    final items = plans.valueOrNull ?? const <SubscriptionPlan>[];
    final currentCode = subscription.valueOrNull?.planCode;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Plans'),
        actions: [
          TextButton(onPressed: () => _refresh(ref), child: const Text('Refresh')),
        ],
      ),
      body: switch (plans) {
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
        _ when items.isEmpty => const Center(child: Text('No plans available.')),
        _ => ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final plan = items[index];
              final isCurrent = plan.code == currentCode;
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(plan.name, style: Theme.of(context).textTheme.titleMedium),
                          ),
                          if (isCurrent) const StatusChip('ACTIVE'),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        plan.priceLabel,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      if (plan.limits.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          'Limits: $plan.limits',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          FilledButton(
                            onPressed: isCurrent ? null : () => _switchTo(context, ref, plan),
                            child: Text(isCurrent ? 'Current plan' : 'Switch now'),
                          ),
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: () => _checkout(context, ref, plan),
                            child: const Text('Checkout'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      },
    );
  }
}