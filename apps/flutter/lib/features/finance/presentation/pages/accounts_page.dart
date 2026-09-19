import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/finance/finance_providers.dart';
import '../../../../core/finance/finance_models.dart';
import '../../../../core/widgets/common.dart';

class AccountsPage extends ConsumerStatefulWidget {
  const AccountsPage({super.key});

  @override
  ConsumerState<AccountsPage> createState() => _AccountsPageState();
}

class _AccountsPageState extends ConsumerState<AccountsPage> {
  Future<void> _refresh() async {
    ref.invalidate(accountsProvider);
    ref.invalidate(accountGroupsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final groups = await ref.read(accountGroupsProvider.future);
    if (!context.mounted) return;
    final code = TextEditingController();
    final name = TextEditingController();
    final type = ValueNotifier<String>('ASSET');
    final groupId = ValueNotifier<String?>(null);

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New account'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: code, decoration: const InputDecoration(labelText: 'Code')),
              const SizedBox(height: 12),
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 12),
              ValueListenableBuilder<String>(
                valueListenable: type,
                builder: (context, selected, _) => DropdownButtonFormField<String>(
                  initialValue: selected,
                  items: const [
                    DropdownMenuItem(value: 'ASSET', child: Text('Asset')),
                    DropdownMenuItem(value: 'LIABILITY', child: Text('Liability')),
                    DropdownMenuItem(value: 'EQUITY', child: Text('Equity')),
                    DropdownMenuItem(value: 'REVENUE', child: Text('Revenue')),
                    DropdownMenuItem(value: 'EXPENSE', child: Text('Expense')),
                  ],
                  onChanged: (value) {
                    type.value = value ?? 'ASSET';
                    groupId.value = null;
                  },
                ),
              ),
              const SizedBox(height: 12),
              ValueListenableBuilder<String>(
                valueListenable: type,
                builder: (context, selected, _) => DropdownButtonFormField<String?>(
                  initialValue: groupId.value,
                  hint: const Text('Group (optional)'),
                  isExpanded: true,
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('No group')),
                    ...groups
                        .where((g) => g.type == selected)
                        .map((g) => DropdownMenuItem<String?>(value: g.id, child: Text(g.name))),
                  ],
                  onChanged: (value) => groupId.value = value,
                ),
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
    if (code.text.trim().isEmpty || name.text.trim().isEmpty) {
      showAppError(context, 'Code and name are required');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(financeRepositoryProvider).createAccount(
              code: code.text.trim(),
              name: name.text.trim(),
              type: type.value,
              groupId: groupId.value,
            );
        await _refresh();
      },
      success: 'Account created',
    );
  }

  Future<void> _toggleActive(Account a) => runAction(
        context,
        () async {
          await ref.read(financeRepositoryProvider).updateAccount(a.id, isActive: !a.isActive);
          await _refresh();
        },
        success: a.isActive ? 'Account deactivated' : 'Account activated',
      );

  @override
  Widget build(BuildContext context) {
    final accounts = ref.watch(accountsProvider);
    final groups = ref.watch(accountGroupsProvider);
    final typeFilter = ref.watch(_typeFilterProvider);
    final rows = (accounts.valueOrNull ?? const <Account>[])
        .where((a) => typeFilter == null || a.type == typeFilter)
        .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: DropdownButton<String?>(
            value: typeFilter,
            hint: const Text('All types'),
            isExpanded: true,
            items: const [
              DropdownMenuItem<String?>(value: null, child: Text('All types')),
              DropdownMenuItem<String?>(value: 'ASSET', child: Text('Asset')),
              DropdownMenuItem<String?>(value: 'LIABILITY', child: Text('Liability')),
              DropdownMenuItem<String?>(value: 'EQUITY', child: Text('Equity')),
              DropdownMenuItem<String?>(value: 'REVENUE', child: Text('Revenue')),
              DropdownMenuItem<String?>(value: 'EXPENSE', child: Text('Expense')),
            ],
            onChanged: (v) => ref.read(_typeFilterProvider.notifier).state = v,
          ),
        ),
        Expanded(
          child: ListScaffold(
            title: 'Chart of Accounts',
            asyncValue: accounts,
            itemCount: rows.length,
            onRefresh: _refresh,
            onCreate: () => _create(context),
            onCreateLabel: 'New account',
            builder: (index) {
              final a = rows[index];
              final group = groups.valueOrNull?.where((g) => g.id == a.groupId).toList();
              return ListTile(
                leading: const Icon(Icons.account_balance_wallet_outlined),
                title: Text('${a.code} — ${a.name}'),
                subtitle: Text(
                  '${group == null || group.isEmpty ? '' : '${group.first.name} '}${a.type}'.trim(),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    StatusChip(a.isActive ? 'ACTIVE' : 'INACTIVE'),
                    TextButton(onPressed: () => _toggleActive(a), child: const Text('Toggle')),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

final _typeFilterProvider = StateProvider<String?>((ref) => null);