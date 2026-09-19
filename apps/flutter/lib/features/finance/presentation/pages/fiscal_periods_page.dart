import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/finance/finance_providers.dart';
import '../../../../core/finance/finance_models.dart';
import '../../../../core/widgets/common.dart';

class FiscalPeriodsPage extends ConsumerStatefulWidget {
  const FiscalPeriodsPage({super.key});

  @override
  ConsumerState<FiscalPeriodsPage> createState() => _FiscalPeriodsPageState();
}

class _FiscalPeriodsPageState extends ConsumerState<FiscalPeriodsPage> {
  Future<void> _refresh() async {
    ref.invalidate(fiscalPeriodsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final name = TextEditingController();
    final startDate = TextEditingController(text: DateTime.now().toIso8601String());
    final endDate = TextEditingController(text: DateTime(DateTime.now().year, 12, 31).toIso8601String());

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New fiscal period'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 12),
            TextField(controller: startDate, decoration: const InputDecoration(labelText: 'Start date (ISO)')),
            const SizedBox(height: 12),
            TextField(controller: endDate, decoration: const InputDecoration(labelText: 'End date (ISO)')),
          ],
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
      showAppError(context, 'Period name is required');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(financeRepositoryProvider).createFiscalPeriod(
              name: name.text.trim(),
              startDate: startDate.text.trim(),
              endDate: endDate.text.trim(),
            );
        await _refresh();
      },
      success: 'Fiscal period created',
    );
  }

  Future<void> _close(FiscalPeriod p) => runAction(
        context,
        () async {
          await ref.read(financeRepositoryProvider).closeFiscalPeriod(p.id);
          await _refresh();
        },
        success: 'Fiscal period closed',
      );

  @override
  Widget build(BuildContext context) {
    final periods = ref.watch(fiscalPeriodsProvider);
    return ListScaffold(
      title: 'Fiscal Periods',
      asyncValue: periods,
      itemCount: periods.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New period',
      builder: (index) {
        final p = periods.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.calendar_month_outlined),
          title: Text(p.name),
          subtitle: Text('${(p.startDate ?? '').substring(0, 10)} → ${(p.endDate ?? '').substring(0, 10)}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(p.status),
              if (p.status == 'OPEN')
                TextButton(onPressed: () => _close(p), child: const Text('Close')),
            ],
          ),
        );
      },
    );
  }
}