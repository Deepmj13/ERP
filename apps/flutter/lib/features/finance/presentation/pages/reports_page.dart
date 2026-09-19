import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/finance/finance_providers.dart';
import '../../../../core/finance/finance_models.dart';
import '../widgets/finance_widgets.dart';

class ReportsPage extends ConsumerStatefulWidget {
  const ReportsPage({super.key});

  @override
  ConsumerState<ReportsPage> createState() => _ReportsPageState();
}

enum _ReportType {
  trialBalance('Trial Balance'),
  ar('Accounts Receivable'),
  ap('Accounts Payable'),
  tax('Tax Summary'),
  income('Income Statement'),
  balanceSheet('Balance Sheet');

  const _ReportType(this.label);
  final String label;
}

class _ReportsPageState extends ConsumerState<ReportsPage> {
  _ReportType _type = _ReportType.trialBalance;

  Future<void> _refresh() async {
    switch (_type) {
      case _ReportType.trialBalance:
        ref.invalidate(trialBalanceProvider);
      case _ReportType.ar:
        ref.invalidate(accountsReceivableProvider);
      case _ReportType.ap:
        ref.invalidate(accountsPayableProvider);
      case _ReportType.tax:
        ref.invalidate(taxSummaryProvider);
      case _ReportType.income:
        ref.invalidate(incomeStatementProvider);
      case _ReportType.balanceSheet:
        ref.invalidate(balanceSheetProvider);
    }
  }

  Widget _buildBody() {
    switch (_type) {
      case _ReportType.trialBalance:
        return _flat(ref.watch(trialBalanceProvider));
      case _ReportType.ar:
        return _flat(ref.watch(accountsReceivableProvider));
      case _ReportType.ap:
        return _flat(ref.watch(accountsPayableProvider));
      case _ReportType.tax:
        return _tax(ref.watch(taxSummaryProvider));
      case _ReportType.income:
        return _tree(_ReportType.income, ref.watch(incomeStatementProvider));
      case _ReportType.balanceSheet:
        return _tree(_ReportType.balanceSheet, ref.watch(balanceSheetProvider));
    }
  }

  Widget _flat(AsyncValue<List<ReportRow>> values) => switch (values) {
        AsyncData(:final value) => Padding(
            padding: const EdgeInsets.all(16),
            child: SingleChildScrollView(
              child: SimpleReportTable(rows: value, balanceIsDelta: false),
            ),
          ),
        AsyncError(:final error) => Center(child: Text('$error')),
        _ => const Center(child: CircularProgressIndicator()),
      };

  Widget _tax(AsyncValue<List<TaxRow>> values) => switch (values) {
        AsyncData(:final value) => Padding(
            padding: const EdgeInsets.all(16),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                columns: const [
                  DataColumn(label: Text('Tax')),
                  DataColumn(label: Text('Taxable amount')),
                  DataColumn(label: Text('Tax amount')),
                ],
                rows: [
                  for (final t in value)
                    DataRow(cells: [
                      DataCell(Text(t.taxName ?? '')),
                      DataCell(Text(t.taxableAmount.toStringAsFixed(2))),
                      DataCell(Text(t.taxAmount.toStringAsFixed(2))),
                    ]),
                ],
              ),
            ),
          ),
        AsyncError(:final error) => Center(child: Text('$error')),
        _ => const Center(child: CircularProgressIndicator()),
      };

  Widget _tree(_ReportType type, AsyncValue<dynamic> values) {
    return switch (values) {
      AsyncData(:final value) => Padding(
          padding: const EdgeInsets.all(16),
          child: SingleChildScrollView(
            child: _NestedReport(list: _flatten(value)),
          ),
        ),
      AsyncError(:final error) => Center(child: Text('$error')),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }

  List<(String name, double value, int depth)> _flatten(dynamic node, [String? prefix, int depth = 0]) {
    final out = <(String, double, int)>[];
    void walk(dynamic n, String? p, int d) {
      if (d > 4 || n is! Map) return;
      (n as Map<String, dynamic>).forEach((key, child) {
        final label = p == null || p.isEmpty ? key : '$p · $key';
        if (child is num) {
          out.add((label, child.toDouble(), d));
        } else {
          walk(child, label, d + 1);
        }
      });
    }

    walk(node, prefix, depth);
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: DropdownButtonFormField<_ReportType>(
            initialValue: _type,
            decoration: const InputDecoration(labelText: 'Report'),
            items: _ReportType.values
                .map((t) => DropdownMenuItem(value: t, child: Text(t.label)))
                .toList(),
            onChanged: (value) {
              if (value != null) setState(() => _type = value);
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(_type.label, style: Theme.of(context).textTheme.titleLarge),
                ),
                SizedBox(height: 600, child: _buildBody()),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _NestedReport extends StatelessWidget {
  const _NestedReport({required this.list});

  final List<(String name, double value, int depth)> list;

  @override
  Widget build(BuildContext context) {
    if (list.isEmpty) return const Text('No data');
    double total = 0;
    for (final (_, value, _) in list) {
      total += value;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (name, value, depth) in list)
          Padding(
            padding: EdgeInsets.only(left: depth * 16, top: 4, bottom: 4),
            child: Row(
              children: [
                Expanded(child: Text(name)),
                const SizedBox(width: 16),
                Text(
                  value.toStringAsFixed(2),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            const Expanded(
              child: Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            Text(
              total.toStringAsFixed(2),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ],
    );
  }
}