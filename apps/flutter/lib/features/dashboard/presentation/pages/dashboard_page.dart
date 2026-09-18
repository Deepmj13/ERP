import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/session_controller.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final ctx = session.context;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          if (session.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Sign out',
              onPressed: () =>
                  ref.read(sessionControllerProvider.notifier).logout(),
            ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'ERP Dashboard — Phase 0 scaffold',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            if (ctx != null) ...[
              Text(ctx.user.email),
              const SizedBox(height: 4),
              Text(ctx.tenant.name, style: Theme.of(context).textTheme.bodySmall),
            ] else
              const Text('Loading…'),
          ],
        ),
      ),
    );
  }
}