import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/auth/session_controller.dart';
import '../../../../core/ops/ops_models.dart';
import '../../../../core/ops/ops_providers.dart';

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

  static const List<({String label, String route, IconData icon})> _salesNav = [
    (label: 'Quotations', route: '/app/sales/quotations', icon: Icons.description_outlined),
    (label: 'Sales Orders', route: '/app/sales/orders', icon: Icons.shopping_cart),
    (label: 'Deliveries', route: '/app/sales/deliveries', icon: Icons.local_shipping),
    (label: 'Invoices', route: '/app/sales/invoices', icon: Icons.receipt_long),
    (label: 'Payments', route: '/app/sales/payments', icon: Icons.payments_outlined),
    (label: 'Bank Accounts', route: '/app/sales/bank-accounts', icon: Icons.account_balance),
  ];

  static const List<({String label, String route, IconData icon})> _inventoryNav = [
    (label: 'Warehouses', route: '/app/inventory/warehouses', icon: Icons.warehouse),
    (label: 'Stock On Hand', route: '/app/inventory/stock', icon: Icons.inventory_2_outlined),
    (label: 'Movements', route: '/app/inventory/movements', icon: Icons.swap_vert),
    (label: 'Adjustments', route: '/app/inventory/adjustments', icon: Icons.tune),
    (label: 'Transfers', route: '/app/inventory/transfers', icon: Icons.swap_horiz),
    (label: 'Low Stock', route: '/app/inventory/low-stock', icon: Icons.warning_amber),
  ];

  static const List<({String label, String route, IconData icon})> _financeNav = [
    (label: 'Chart of Accounts', route: '/app/finance/accounts', icon: Icons.account_balance_wallet_outlined),
    (label: 'Journal Entries', route: '/app/finance/journal', icon: Icons.menu_book_outlined),
    (label: 'Fiscal Periods', route: '/app/finance/fiscal-periods', icon: Icons.calendar_month_outlined),
    (label: 'Bank Transactions', route: '/app/finance/bank', icon: Icons.swap_vert),
    (label: 'Reports', route: '/app/finance/reports', icon: Icons.insert_chart_outlined),
  ];

  static const List<({String label, String route, IconData icon})> _opsNav = [
    (label: 'Projects', route: '/app/ops/projects', icon: Icons.folder_outlined),
    (label: 'Tasks', route: '/app/ops/tasks', icon: Icons.check_circle_outline),
    (label: 'Approvals', route: '/app/ops/approvals', icon: Icons.rule),
    (label: 'Notifications', route: '/app/ops/notifications', icon: Icons.notifications_outlined),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionControllerProvider);
    final ctx = session.context;
    final kpis = ref.watch(kpisProvider);
    final trend = ref.watch(salesTrendProvider);
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final k = kpis.valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          Badge(
            isLabelVisible: unread > 0,
            label: Text('$unread'),
            child: IconButton(
              icon: const Icon(Icons.notifications_outlined),
              tooltip: 'Notifications',
              onPressed: () => context.go('/app/ops/notifications'),
            ),
          ),
          if (session.isAuthenticated)
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'Sign out',
              onPressed: () => ref.read(sessionControllerProvider.notifier).logout(),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(kpisProvider);
          ref.invalidate(salesTrendProvider);
          ref.invalidate(unreadNotificationsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (k != null) ...[
              Row(
                children: [
                  _KpiCard(icon: Icons.payments, label: 'Revenue', value: k.revenue.toStringAsFixed(2)),
                  _KpiCard(
                    icon: Icons.receipt_long,
                    label: 'Outstanding (AR)',
                    value: k.outstanding.toStringAsFixed(2),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _KpiCard(icon: Icons.rule, label: 'Approvals pending', value: '${k.pendingForMe}', onTap: () => context.go('/app/ops/approvals')),
                  _KpiCard(
                    icon: Icons.warning_amber,
                    label: 'Low stock items',
                    value: '${k.lowStockItems}',
                    onTap: () => context.go('/app/inventory/low-stock'),
                  ),
                  _KpiCard(icon: Icons.check_circle_outline, label: 'Open tasks', value: '${k.openTasks}', onTap: () => context.go('/app/ops/tasks')),
                ],
              ),
              const SizedBox(height: 24),
              Text('Revenue trend (monthly)', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              _TrendChart(points: trend.valueOrNull ?? const []),
              const SizedBox(height: 24),
            ],
            Text(
              'Operations',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ..._opsNav.map(
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
            Text(
              'Sales',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ..._salesNav.map(
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
              'Inventory',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ..._inventoryNav.map(
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
              'Finance',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            ..._financeNav.map(
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
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 8),
                Text(value, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 2),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Minimal hand-rolled revenue bar chart (no third-party chart dependency).
class _TrendChart extends StatelessWidget {
  const _TrendChart({required this.points});

  final List<SalesTrendPoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return const SizedBox(height: 96, child: Center(child: Text('No posted invoices yet.')));
    }
    final maxRevenue = points.map((p) => p.revenue).fold<double>(0, (a, b) => b > a ? b : a);
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final point in points)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Tooltip(
                  message:
                      '${point.bucket}: ${point.revenue.toStringAsFixed(2)} (${point.count} invoice(s))',
                  child: Container(
                    height: maxRevenue == 0 ? 2 : 14 + (120 * point.revenue / maxRevenue),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}