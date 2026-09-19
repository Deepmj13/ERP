import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/ops/ops_providers.dart';
import '../../../../core/widgets/common.dart';

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(notificationsProvider);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> _markAllRead(BuildContext context, WidgetRef ref) => runAction(
        context,
        () async {
          await ref.read(opsRepositoryProvider).markAllRead();
          await _refresh(ref);
        },
        success: 'All notifications marked as read',
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final items = notifications.valueOrNull ?? const [];

    return Scaffold(
      appBar: AppBar(
        title: Text(unread > 0 ? 'Notifications ($unread unread)' : 'Notifications'),
        actions: [
          TextButton(
            onPressed: () => _markAllRead(context, ref),
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: switch (notifications) {
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
        _ when items.isEmpty => const Center(child: Text('No notifications yet.')),
        _ => RefreshIndicator(
            onRefresh: () => _refresh(ref),
            child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 16),
              itemCount: items.length,
              itemBuilder: (context, index) {
                final notification = items[index];
                return ListTile(
                  leading: Icon(
                    notification.isRead ? Icons.notifications_none : Icons.notifications_active,
                    color: notification.isRead ? Colors.blueGrey : null,
                  ),
                  title: Text(
                    notification.title,
                    style: notification.isRead ? null : const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (notification.body != null) Text(notification.body!),
                      if (notification.createdAt != null)
                        Text(
                          notification.createdAt!,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
      },
    );
  }
}