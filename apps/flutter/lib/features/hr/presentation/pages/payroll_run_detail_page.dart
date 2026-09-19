import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_models.dart';
import '../../../../core/hr/hr_providers.dart';
import '../pdf/pdf_saver.dart';
import '../widgets/hr_widgets.dart';

/// Run detail: period/totals summary, status-aware workflow actions and the
/// payslip list with per-payslip PDF generate/download (Phase 7b).
class PayrollRunDetailPage extends ConsumerStatefulWidget {
  const PayrollRunDetailPage({super.key, required this.runId});

  final String runId;

  @override
  ConsumerState<PayrollRunDetailPage> createState() => _PayrollRunDetailPageState();
}

class _PayrollRunDetailPageState extends ConsumerState<PayrollRunDetailPage> {
  Future<void> _refresh() =>
      ref.refresh(runDetailProvider(widget.runId).future).then((_) {});

  Future<void> _transition(String action, String success) async {
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        switch (action) {
          case 'calculate':
            await repo.calculatePayrollRun(widget.runId);
          case 'approve':
            await repo.approvePayrollRun(widget.runId);
          case 'post':
            await repo.postPayrollRun(widget.runId);
          case 'reverse':
            await repo.reversePayrollRun(widget.runId);
        }
        await _refresh();
      },
      success: success,
    );
  }

  Future<void> _queuePdf(Payslip payslip) async {
    await runAction(
      context,
      () async {
        await ref.read(hrRepositoryProvider).queuePayslipPdf(payslip.id);
        await _refresh();
      },
      success: 'Payslip PDF queued',
    );
  }

  Future<void> _downloadPdf(Payslip payslip) async {
    try {
      final bytes = await ref.read(hrRepositoryProvider).downloadPayslipPdf(payslip.id);
      final name = 'payslip-${payslip.employeeNo ?? payslip.employeeId}.pdf';
      final path = await savePdfBytes(bytes, name);
      if (!mounted) return;
      final message = path != null ? 'Saved to $path' : 'PDF (${bytes.length} bytes) fetched';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (e) {
      if (mounted) showHrError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final run = ref.watch(runDetailProvider(widget.runId));
    return Scaffold(
      appBar: AppBar(title: const Text('Payroll Run')),
      body: switch (run) {
        AsyncValue(:final error?) => _ErrorView(error: error, onRetry: _refresh),
        AsyncValue(value: null) => const Center(child: CircularProgressIndicator()),
        _ => RefreshIndicator(
            onRefresh: _refresh,
            child: _buildBody(context, run.valueOrNull!),
          ),
      },
    );
  }

  Widget _buildBody(BuildContext context, PayrollRun run) {
    final theme = Theme.of(context);
    final actions = <Widget>[
      if (run.status == 'DRAFT') _action('Calculate', Icons.functions, () => _transition('calculate', 'Run recalculated')),
      if (run.status == 'DRAFT') _action('Approve', Icons.check, () => _transition('approve', 'Run approved')),
      if (run.status == 'APPROVED') _action('Post', Icons.payments_outlined, () => _transition('post', 'Run posted')),
      if (run.status == 'POSTED') _action('Reverse', Icons.undo, () => _transition('reverse', 'Run reversed')),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(run.number, style: theme.textTheme.titleLarge)),
                    StatusChip(run.status),
                  ],
                ),
                const SizedBox(height: 8),
                Text(run.periodLabel, style: theme.textTheme.bodyMedium),
                const Divider(height: 24),
                _summaryRow('Gross', run.totalGross),
                _summaryRow('Deductions', run.totalDeductions),
                const Divider(height: 24),
                Text('Net pay: ${_fmt(run.totalNet)}', style: theme.textTheme.titleMedium),
                const SizedBox(height: 12),
                Wrap(spacing: 8, children: actions),
                if (run.reversedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'Reversed ${run.reversedAt.toString().split('T').first}',
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.red),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Payslips (${run.payslips.length})', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        if (run.payslips.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: Text('Calculate the run to generate payslips.')),
          )
        else
          ...run.payslips.map((payslip) => _payslipTile(context, payslip)),
      ],
    );
  }

  Widget _action(String label, IconData icon, VoidCallback onPressed) {
    return FilledButton.tonalIcon(onPressed: onPressed, icon: Icon(icon), label: Text(label));
  }

  Widget _summaryRow(String label, double value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [Text(label), Text(_fmt(value))],
      ),
    );
  }

  Widget _payslipTile(BuildContext context, Payslip payslip) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.receipt),
        title: Text(payslip.employeeName ?? payslip.employeeId),
        subtitle: Text('${payslip.employeeNo ?? ''} · Net ${_fmt(payslip.netPay)}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.picture_as_pdf_outlined),
              tooltip: payslip.hasPdf ? 'Download PDF' : 'Generate PDF',
              onPressed: () => payslip.hasPdf ? _downloadPdf(payslip) : _queuePdf(payslip),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, this.onRetry});
  final Object error;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 40),
          const SizedBox(height: 8),
          Text('$error'),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}

String _fmt(double value) {
  final parts = value.toStringAsFixed(2).split('.');
  final digits = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '$digits.${parts[1]}';
}