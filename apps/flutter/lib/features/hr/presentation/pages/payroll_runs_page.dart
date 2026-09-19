import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

/// Payroll runs list + create (Phase 7b). Tap a run for its detail/actions.
class PayrollRunsPage extends ConsumerStatefulWidget {
  const PayrollRunsPage({super.key});

  @override
  ConsumerState<PayrollRunsPage> createState() => _PayrollRunsPageState();
}

class _PayrollRunsPageState extends ConsumerState<PayrollRunsPage> {
  Future<void> _refresh() => ref.refresh(payrollRunsProvider.future).then((_) {});

  Future<void> _create(BuildContext context) async {
    final periodStart = TextEditingController();
    final periodEnd = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New payroll run'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: periodStart,
                decoration: const InputDecoration(labelText: 'Period start', hintText: 'YYYY-MM-DD'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: periodEnd,
                decoration: const InputDecoration(labelText: 'Period end', hintText: 'YYYY-MM-DD'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Create')),
        ],
      ),
    );
    if (created != true || context.mounted != true) return;
    await runAction(
      context,
      () async {
        if (periodStart.text.trim().isEmpty || periodEnd.text.trim().isEmpty) {
          throw ArgumentError('Both period dates are required');
        }
        final repo = ref.read(hrRepositoryProvider);
        await repo.createPayrollRun(
          periodStart: periodStart.text.trim(),
          periodEnd: periodEnd.text.trim(),
        );
        await _refresh();
      },
      success: 'Payroll run created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final runs = ref.watch(payrollRunsProvider);
    return HrListScaffold(
      title: 'Payroll Runs',
      asyncValue: runs,
      itemCount: runs.valueOrNull?.length ?? 0,
      emptyHint: 'No payroll runs yet — create one for a period.',
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New run',
      builder: (index) {
        final run = runs.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.receipt_long),
          title: Text(run.number),
          subtitle: Text(
            '${run.periodLabel} · ${run.payslipCount} payslips · Net ${_fmt(run.totalNet)}',
          ),
          trailing: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(run.status),
              const SizedBox(height: 4),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (run.status == 'DRAFT')
                    IconButton(
                      icon: const Icon(Icons.functions, color: Colors.teal),
                      tooltip: 'Calculate',
                      onPressed: () => _transition(context, run.id, 'calculate', 'Run recalculated'),
                    ),
                  const Icon(Icons.chevron_right),
                ],
              ),
            ],
          ),
          onTap: () => context.push('/app/hr/payroll/${run.id}'),
        );
      },
    );
  }

  Future<void> _transition(BuildContext context, String id, String action, String success) async {
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        switch (action) {
          case 'calculate':
            await repo.calculatePayrollRun(id);
          case 'approve':
            await repo.approvePayrollRun(id);
          case 'post':
            await repo.postPayrollRun(id);
          case 'reverse':
            await repo.reversePayrollRun(id);
        }
        await _refresh();
      },
      success: success,
    );
  }
}

String _fmt(double value) {
  final parts = value.toStringAsFixed(2).split('.');
  final digits = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '$digits.${parts[1]}';
}