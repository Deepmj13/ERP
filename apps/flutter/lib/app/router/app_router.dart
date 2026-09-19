import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/session_controller.dart';
import '../../core/auth/session_state.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/procurement/presentation/pages/vendors_page.dart';
import '../../features/procurement/presentation/pages/purchase_requests_page.dart';
import '../../features/procurement/presentation/pages/purchase_orders_page.dart';
import '../../features/procurement/presentation/pages/goods_receipts_page.dart';
import '../../features/procurement/presentation/pages/vendor_bills_page.dart';
import '../../features/procurement/presentation/pages/vendor_payments_page.dart';
import '../../features/hr/presentation/pages/employees_page.dart';
import '../../features/hr/presentation/pages/departments_page.dart';
import '../../features/hr/presentation/pages/attendance_page.dart';
import '../../features/hr/presentation/pages/leaves_page.dart';
import '../../features/hr/presentation/pages/leave_types_page.dart';
import '../../features/hr/presentation/pages/salary_structures_page.dart';
import '../../features/hr/presentation/pages/payroll_runs_page.dart';
import '../../features/hr/presentation/pages/payroll_run_detail_page.dart';
import '../../features/sales/presentation/pages/quotations_page.dart';
import '../../features/sales/presentation/pages/orders_page.dart';
import '../../features/sales/presentation/pages/deliveries_page.dart';
import '../../features/sales/presentation/pages/invoices_page.dart';
import '../../features/sales/presentation/pages/payments_page.dart';
import '../../features/sales/presentation/pages/bank_accounts_page.dart';
import '../../features/inventory/presentation/pages/warehouses_page.dart';
import '../../features/inventory/presentation/pages/stock_page.dart';
import '../../features/inventory/presentation/pages/movements_page.dart';
import '../../features/inventory/presentation/pages/adjustments_page.dart';
import '../../features/inventory/presentation/pages/transfers_page.dart';
import '../../features/inventory/presentation/pages/low_stock_page.dart';
import '../../features/finance/presentation/pages/accounts_page.dart';
import '../../features/finance/presentation/pages/journal_page.dart';
import '../../features/finance/presentation/pages/fiscal_periods_page.dart';
import '../../features/finance/presentation/pages/bank_page.dart';
import '../../features/finance/presentation/pages/reports_page.dart';
import '../../features/ops/presentation/pages/projects_page.dart';
import '../../features/ops/presentation/pages/tasks_page.dart';
import '../../features/ops/presentation/pages/approvals_page.dart';
import '../../features/ops/presentation/pages/notifications_page.dart';

/// Route map (plan §4) — route names are the contract between the Flutter app
/// and its deep-linking/save-state needs. Auth-guarded (G-5): unauthenticated
/// users land on `/auth/login`; signed-in users cannot reach `/auth/*`.
final appRouterProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final session = ref.read(sessionControllerProvider);
      final location = state.matchedLocation;

      if (session.isRestoring) {
        return location == '/splash' ? null : '/splash';
      }
      if (!session.isAuthenticated) {
        return location.startsWith('/auth') ? null : '/auth/login';
      }
      if (location.startsWith('/auth')) return '/app/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashPage()),
      GoRoute(
        path: '/auth/login',
        name: 'auth',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/auth/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (context, state, child) => _AppShell(child: child),
        routes: [
          GoRoute(
            path: '/app/dashboard',
            name: 'dashboard',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: '/app/procurement/vendors',
            name: 'procurement.vendors',
            builder: (context, state) => const VendorsPage(),
          ),
          GoRoute(
            path: '/app/procurement/requests',
            name: 'procurement.requests',
            builder: (context, state) => const PurchaseRequestsPage(),
          ),
          GoRoute(
            path: '/app/procurement/orders',
            name: 'procurement.orders',
            builder: (context, state) => const PurchaseOrdersPage(),
          ),
          GoRoute(
            path: '/app/procurement/grns',
            name: 'procurement.grn',
            builder: (context, state) => const GoodsReceiptsPage(),
          ),
          GoRoute(
            path: '/app/procurement/vendor-bills',
            name: 'procurement.bills',
            builder: (context, state) => const VendorBillsPage(),
          ),
          GoRoute(
            path: '/app/procurement/vendor-payments',
            name: 'procurement.payments',
            builder: (context, state) => const VendorPaymentsPage(),
          ),
          GoRoute(
            path: '/app/hr/employees',
            name: 'hr.employees',
            builder: (context, state) => const EmployeesPage(),
          ),
          GoRoute(
            path: '/app/hr/departments',
            name: 'hr.departments',
            builder: (context, state) => const DepartmentsPage(),
          ),
          GoRoute(
            path: '/app/hr/attendance',
            name: 'hr.attendance',
            builder: (context, state) => const AttendancePage(),
          ),
          GoRoute(
            path: '/app/hr/leaves',
            name: 'hr.leaves',
            builder: (context, state) => const LeavesPage(),
          ),
          GoRoute(
            path: '/app/hr/leave-types',
            name: 'hr.leave-types',
            builder: (context, state) => const LeaveTypesPage(),
          ),
          GoRoute(
            path: '/app/hr/salaries',
            name: 'hr.salaries',
            builder: (context, state) => const SalaryStructuresPage(),
          ),
          GoRoute(
            path: '/app/hr/payroll',
            name: 'hr.payroll',
            builder: (context, state) => const PayrollRunsPage(),
          ),
          GoRoute(
            path: '/app/hr/payroll/:id',
            name: 'hr.payroll-detail',
            builder: (context, state) => PayrollRunDetailPage(runId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: '/app/sales/quotations',
            name: 'sales.quotations',
            builder: (context, state) => const QuotationsPage(),
          ),
          GoRoute(
            path: '/app/sales/orders',
            name: 'sales.orders',
            builder: (context, state) => const OrdersPage(),
          ),
          GoRoute(
            path: '/app/sales/deliveries',
            name: 'sales.deliveries',
            builder: (context, state) => const DeliveriesPage(),
          ),
          GoRoute(
            path: '/app/sales/invoices',
            name: 'sales.invoices',
            builder: (context, state) => const InvoicesPage(),
          ),
          GoRoute(
            path: '/app/sales/payments',
            name: 'sales.payments',
            builder: (context, state) => const PaymentsPage(),
          ),
          GoRoute(
            path: '/app/sales/bank-accounts',
            name: 'sales.bank-accounts',
            builder: (context, state) => const BankAccountsPage(),
          ),
          GoRoute(
            path: '/app/inventory/warehouses',
            name: 'inventory.warehouses',
            builder: (context, state) => const WarehousesPage(),
          ),
          GoRoute(
            path: '/app/inventory/stock',
            name: 'inventory.stock',
            builder: (context, state) => const StockPage(),
          ),
          GoRoute(
            path: '/app/inventory/movements',
            name: 'inventory.movements',
            builder: (context, state) => const MovementsPage(),
          ),
          GoRoute(
            path: '/app/inventory/adjustments',
            name: 'inventory.adjustments',
            builder: (context, state) => const AdjustmentsPage(),
          ),
          GoRoute(
            path: '/app/inventory/transfers',
            name: 'inventory.transfers',
            builder: (context, state) => const TransfersPage(),
          ),
          GoRoute(
            path: '/app/inventory/low-stock',
            name: 'inventory.low-stock',
            builder: (context, state) => const LowStockPage(),
          ),
          GoRoute(
            path: '/app/finance/accounts',
            name: 'finance.accounts',
            builder: (context, state) => const AccountsPage(),
          ),
          GoRoute(
            path: '/app/finance/journal',
            name: 'finance.journal',
            builder: (context, state) => const JournalPage(),
          ),
          GoRoute(
            path: '/app/finance/fiscal-periods',
            name: 'finance.fiscal-periods',
            builder: (context, state) => const FiscalPeriodsPage(),
          ),
          GoRoute(
            path: '/app/finance/bank',
            name: 'finance.bank',
            builder: (context, state) => const BankPage(),
          ),
          GoRoute(
            path: '/app/finance/reports',
            name: 'finance.reports',
            builder: (context, state) => const ReportsPage(),
          ),
          GoRoute(
            path: '/app/ops/projects',
            name: 'ops.projects',
            builder: (context, state) => const ProjectsPage(),
          ),
          GoRoute(
            path: '/app/ops/tasks',
            name: 'ops.tasks',
            builder: (context, state) => const TasksPage(),
          ),
          GoRoute(
            path: '/app/ops/approvals',
            name: 'ops.approvals',
            builder: (context, state) => const ApprovalsPage(),
          ),
          GoRoute(
            path: '/app/ops/notifications',
            name: 'ops.notifications',
            builder: (context, state) => const NotificationsPage(),
          ),
        ],
      ),
    ],
  );

  // Re-run redirects on every session transition (restoring→auth→out, …).
  ref.listen<SessionState>(sessionControllerProvider, (_, _) {
    router.refresh();
  });
  return router;
});

class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

/// App shell behind the `/app` guard; hosts the authenticated scaffold.
class _AppShell extends StatelessWidget {
  const _AppShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(child: child),
    );
  }
}