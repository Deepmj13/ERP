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
    );
  }
}