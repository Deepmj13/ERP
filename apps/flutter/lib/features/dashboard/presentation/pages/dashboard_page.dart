import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/session_controller.dart';

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  static const List<({String label, String route, IconData icon})> _nav = [
    (label: 'Vendors', route: '/app/procurement/vendors', icon: Icons.business),
    (label: 'Purchase Requests', route: '/app/procurement/requests', icon: Icons.request_page),
    (label: 'Purchase Orders', route: '/app/procurement/orders', icon: Icons.shopping_cart),
    (label: 'Goods Receipts', route: '/app/procurement/grns', icon: Icons.inventory_2),
    (label: 'Vendor Bills', route: '/app/procurement/vendor-bills', icon: Icons.receipt_long),
    (label: 'Vendor Payments', route: '/app/procurement/vendor-payments', icon: Icons.payments_outlined),
  ];

  static const List<({String label, String route, IconData icon})> _hrNav = [
    (label: 'Employees', route: '/app/hr/employees', icon: Icons.people),
    (label: 'Departments', route: '/app/hr/departments', icon: Icons.account_tree),
    (label: 'Attendance', route: '/app/hr/attendance', icon: Icons.access_time),
    (label: 'Leave Requests', route: '/app/hr/leaves', icon: Icons.event),
    (label: 'Leave Types', route: '/app/hr/leave-types', icon: Icons.beach_access),
    (label: 'Salary Structures', route: '/app/hr/salaries', icon: Icons.paid_outlined),
    (label: 'Payroll', route: '/app/hr/payroll', icon: Icons.account_balance_wallet),
  ];

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
              onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Procurement',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ..._nav.map(
            (item) => Card(
              child: ListTile(
                leading: Icon(item.icon),
                title: Text(item.label),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.go(item.route),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'People (HR)',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          ..._hrNav.map(
            (item) => Card(
              child: ListTile(
                leading: Icon(item.icon),
                title: Text(item.label),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.go(item.route),
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (ctx != null) ...[
            Text(ctx.user.email),
            const SizedBox(height: 4),
            Text(ctx.tenant.name, style: Theme.of(context).textTheme.bodySmall),
          ] else
            const Text('Loading…'),
        ],
      ),
    );
  }
}