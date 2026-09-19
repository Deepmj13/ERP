import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/finance/finance_providers.dart';
import '../../../../core/finance/finance_models.dart';
import '../../../../core/sales/sales_providers.dart';
import '../../../../core/widgets/common.dart';

class BankPage extends ConsumerStatefulWidget {
  const BankPage({super.key});

  @override
  ConsumerState<BankPage> createState() => _BankPageState();
}

class _BankPageState extends ConsumerState<BankPage> {
  Future<void> _refresh() async {
    ref.invalidate(bankTransactionsProvider);
  }

  Future<void> _import(BuildContext context) async {
    final ctx = context;
    final bankAccounts = await ref.read(bankAccountsProvider.future);
    if (!ctx.mounted) return;
    final accountId = ValueNotifier<String?>(bankAccounts.isNotEmpty ? bankAccounts.first.id : null);
    final dateFormat = TextEditingController(text: 'yyyy-MM-dd');
    final raw = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: ctx,
      builder: (context) => AlertDialog(
        title: const Text('Import bank transaction'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: accountId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Bank account'),
                    isExpanded: true,
                    items: bankAccounts
                        .map((a) => DropdownMenuItem(value: a.id, child: Text(a.name)))
                        .toList(),
                    onChanged: (value) => accountId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: dateFormat,
                  decoration: const InputDecoration(
                    labelText: 'Date format',
                    helperText: 'e.g. yyyy-MM-dd or dd/MM/yyyy',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: raw,
                  maxLines: 8,
                  decoration: const InputDecoration(
                    labelText: 'Rows (one per line)',
                    helperText: 'date, description, amount — comma or tab separated',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Import')),
        ],
      ),
    );
    if (confirmed != true || !ctx.mounted || accountId.value == null) return;
    final rows = raw.text
        .split(RegExp(r'\r?\n'))
        .where((l) => l.trim().isNotEmpty)
        .map((l) {
      final parts = l.split(RegExp(r'[\t,]')).map((p) => p.trim()).toList();
      return <dynamic>[...parts];
    }).toList();
    if (rows.isEmpty) {
      showAppError(context, 'No rows to import');
      return;
    }
    await runAction(
      ctx,
      () async {
        final count = await ref.read(financeRepositoryProvider).importBankTransactions(
              accountId: accountId.value!,
              dateFormat: dateFormat.text.trim().isEmpty ? 'yyyy-MM-dd' : dateFormat.text.trim(),
              rows: rows,
            );
        if (!ctx.mounted) return;
        ref.invalidate(bankTransactionsProvider);
        if (count > 0) {
          ScaffoldMessenger.of(ctx)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text('Imported $count transaction(s)')));
        }
      },
      success: 'Import complete',
    );
  }

  Future<void> _reconcile(BankTransaction t) => runAction(
        context,
        () async {
          await ref.read(financeRepositoryProvider).reconcileBankTransaction(t.id);
          await _refresh();
        },
        success: 'Transaction reconciled',
      );

  Future<void> _match(BankTransaction t) async {
    final ctx = context;
    final all = await ref.read(bankTransactionsProvider.future);
    if (!ctx.mounted) return;
    final candidates = all.where((x) => x.id != t.id && x.status == 'PENDING').toList();
    if (candidates.isEmpty) {
      showAppError(ctx, 'No other pending transactions to match');
      return;
    }
    final matchedId = ValueNotifier<String?>(candidates.first.id);
    final confirmed = await showDialog<bool>(
      context: ctx,
      builder: (context) => AlertDialog(
        title: const Text('Match transaction'),
        content: ValueListenableBuilder<String?>(
          valueListenable: matchedId,
          builder: (context, selected, _) => DropdownButtonFormField<String>(
            initialValue: selected,
            hint: const Text('Matched against'),
            isExpanded: true,
            items: candidates
                .map((x) => DropdownMenuItem(
                      value: x.id,
                      child: Text(
                        '${(x.transactionDate ?? '').substring(0, 10)} — ${x.description ?? ''} — '
                        '${x.amount.toStringAsFixed(2)}',
                      ),
                    ))
                .toList(),
            onChanged: (value) => matchedId.value = value,
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Match'),
          ),
        ],
      ),
    );
    if (confirmed != true || !ctx.mounted || matchedId.value == null) return;
    await runAction(
      ctx,
      () async {
        await ref
            .read(financeRepositoryProvider)
            .matchBankTransaction(t.id, matchedWithId: matchedId.value!);
        await _refresh();
      },
      success: 'Transaction matched',
    );
  }

  @override
  Widget build(BuildContext context) {
    final transactions = ref.watch(bankTransactionsProvider);
    return ListScaffold(
      title: 'Bank Transactions',
      asyncValue: transactions,
      itemCount: transactions.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _import(context),
      onCreateLabel: 'Import',
      builder: (index) {
        final t = transactions.valueOrNull![index];
        final positive = t.amount >= 0;
        return ListTile(
          leading: const Icon(Icons.swap_vert),
          title: Text(t.description ?? (t.reference ?? t.id)),
          subtitle: Text(
            '${t.accountName ?? ''} — ${t.currency} — ${(t.transactionDate ?? '').substring(0, 10)}'.trim(),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${positive ? '+' : ''}${t.amount.toStringAsFixed(2)}',
                style: TextStyle(
                  color: positive ? Colors.green : Colors.red,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(t.status),
              if (t.status == 'PENDING') ...[
                TextButton(onPressed: () => _reconcile(t), child: const Text('Reconcile')),
                TextButton(onPressed: () => _match(t), child: const Text('Match')),
              ],
            ],
          ),
        );
      },
    );
  }
}