import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/widgets/common.dart';

class BankAccountsPage extends ConsumerStatefulWidget {
  const BankAccountsPage({super.key});

  @override
  ConsumerState<BankAccountsPage> createState() => _BankAccountsPageState();
}

class _BankAccountsPageState extends ConsumerState<BankAccountsPage> {
  Future<void> _refresh() async {
    ref.invalidate(bankAccountsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final name = TextEditingController();
    final accountNumber = TextEditingController();
    final accountName = TextEditingController();
    final currency = TextEditingController(text: 'USD');
    final openingBalance = TextEditingController(text: '0');

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New bank account'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 12),
              TextField(controller: accountNumber, decoration: const InputDecoration(labelText: 'Account number')),
              const SizedBox(height: 12),
              TextField(controller: accountName, decoration: const InputDecoration(labelText: 'Account name')),
              const SizedBox(height: 12),
              TextField(controller: currency, decoration: const InputDecoration(labelText: 'Currency')),
              const SizedBox(height: 12),
              TextField(
                controller: openingBalance,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Opening balance'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (created != true || context.mounted != true) return;
    if (name.text.trim().isEmpty) {
      showAppError(context, 'Bank account name is required');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(salesRepositoryProvider).createBankAccount(
              name: name.text.trim(),
              accountNumber: accountNumber.text.trim().isEmpty ? null : accountNumber.text.trim(),
              accountName: accountName.text.trim().isEmpty ? null : accountName.text.trim(),
              currency: currency.text.trim().isEmpty ? null : currency.text.trim(),
              openingBalance: double.tryParse(openingBalance.text) ?? 0,
            );
        await _refresh();
      },
      success: 'Bank account created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final accounts = ref.watch(bankAccountsProvider);
    return ListScaffold(
      title: 'Bank Accounts',
      asyncValue: accounts,
      itemCount: accounts.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New account',
      builder: (index) {
        final account = accounts.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.account_balance),
          title: Text(account.name),
          subtitle: Text(
            '${account.accountNumber ?? ''} — ${account.currency} — ${account.openingBalance.toStringAsFixed(2)}'.trim(),
          ),
          trailing: StatusChip(account.isActive ? 'ACTIVE' : 'INACTIVE'),
        );
      },
    );
  }
}