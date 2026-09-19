import 'package:flutter/material.dart';

import '../../../../core/finance/finance_models.dart';

/// Editable journal lines: account picker + debit/credit pair per row with a
/// running total so the caller can flag an unbalanced entry before posting.
class JournalLinesEditor extends StatefulWidget {
  const JournalLinesEditor({
    super.key,
    required this.accounts,
    required this.onChanged,
  });

  final List<Account> accounts;
  final ValueChanged<({List<JournalLine> lines, double debit, double credit})> onChanged;

  @override
  State<JournalLinesEditor> createState() => _JournalLinesEditorState();
}

class _JournalLinesEditorState extends State<JournalLinesEditor> {
  final _lines = <({String? accountId, TextEditingController debit, TextEditingController credit})>[];

  @override
  void initState() {
    super.initState();
    _addLine();
  }

  @override
  void dispose() {
    for (final l in _lines) {
      l.debit.dispose();
      l.credit.dispose();
    }
    super.dispose();
  }

  void _addLine() {
    setState(() {
      _lines.add((
        accountId: null,
        debit: TextEditingController(text: '0'),
        credit: TextEditingController(text: '0'),
      ));
    });
  }

  void _removeLine(int index) {
    setState(() {
      final line = _lines.removeAt(index);
      line.debit.dispose();
      line.credit.dispose();
    });
    _emit();
  }

  void _emit() {
    final lines = <JournalLine>[];
    var debit = 0.0;
    var credit = 0.0;
    for (final l in _lines) {
      final accountId = l.accountId;
      if (accountId == null) continue;
      final d = double.tryParse(l.debit.text) ?? 0;
      final c = double.tryParse(l.credit.text) ?? 0;
      debit += d;
      credit += c;
      lines.add(JournalLine(accountId: accountId, debit: d, credit: c, narration: null));
    }
    widget.onChanged((lines: lines, debit: debit, credit: credit));
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < _lines.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _lines[i].accountId,
                    hint: const Text('Account'),
                    isExpanded: true,
                    items: widget.accounts
                        .where((a) => a.isActive)
                        .map((a) => DropdownMenuItem<String>(
                              value: a.id,
                              child: Text(
                                '${a.code} ${a.name}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ))
                        .toList(),
                    onChanged: (value) {
                      _lines[i] = (accountId: value, debit: _lines[i].debit, credit: _lines[i].credit);
                      setState(() {});
                      _emit();
                    },
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 88,
                  child: TextField(
                    controller: _lines[i].debit,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Dr', isDense: true),
                    onChanged: (_) => _emit(),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 88,
                  child: TextField(
                    controller: _lines[i].credit,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(labelText: 'Cr', isDense: true),
                    onChanged: (_) => _emit(),
                  ),
                ),
                IconButton(
                  tooltip: 'Remove line',
                  onPressed: () => _removeLine(i),
                  icon: const Icon(Icons.remove_circle_outline),
                ),
              ],
            ),
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _addLine,
            icon: const Icon(Icons.add),
            label: const Text('Add line'),
          ),
        ),
      ],
    );
  }
}

/// Read-only horizontal table used by flat reports (trial balance, AR/AP).
class SimpleReportTable extends StatelessWidget {
  const SimpleReportTable({
    super.key,
    required this.rows,
    this.debitColumn = 'Debit',
    this.creditColumn = 'Credit',
    this.balanceColumn,
    this.balanceIsDelta = true,
  });

  final List<ReportRow> rows;
  final String debitColumn;
  final String creditColumn;
  final String? balanceColumn;
  final bool balanceIsDelta;

  double get _totalDebit =>
      rows.fold<double>(0, (s, r) => s + (balanceIsDelta ? (r.debit == 0 ? (r.balance > 0 ? r.balance : 0) : r.debit) : r.debit));
  double get _totalCredit =>
      rows.fold<double>(0, (s, r) => s + (balanceIsDelta ? (r.credit == 0 ? (r.balance < 0 ? -r.balance : 0) : r.credit) : r.credit));

  @override
  Widget build(BuildContext context) {
    final columns = <String>['Account', debitColumn, ?balanceColumn, creditColumn];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 24,
        columns: [for (final c in columns) DataColumn(label: Text(c))],
        rows: [
          for (final r in rows)
            DataRow(cells: [
              DataCell(Text('${r.code ?? ''} ${r.name ?? ''}'.trim())),
              DataCell(Text(r.debit.toStringAsFixed(2))),
              if (balanceColumn != null) DataCell(Text((balanceIsDelta ? r.balance : r.value).toStringAsFixed(2))),
              DataCell(Text(r.credit.toStringAsFixed(2))),
            ]),
          DataRow(
            cells: [
              const DataCell(Text('Total', style: TextStyle(fontWeight: FontWeight.bold))),
              DataCell(Text(_totalDebit.toStringAsFixed(2), style: const TextStyle(fontWeight: FontWeight.bold))),
              if (balanceColumn != null) DataCell(Text('')),
              DataCell(Text(_totalCredit.toStringAsFixed(2), style: const TextStyle(fontWeight: FontWeight.bold))),
            ],
          ),
        ],
      ),
    );
  }
}