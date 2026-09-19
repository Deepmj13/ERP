import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

class LeaveTypesPage extends ConsumerStatefulWidget {
  const LeaveTypesPage({super.key});

  @override
  ConsumerState<LeaveTypesPage> createState() => _LeaveTypesPageState();
}

class _LeaveTypesPageState extends ConsumerState<LeaveTypesPage> {
  Future<void> _refresh() async {
    ref.invalidate(leaveTypesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final code = TextEditingController();
    final name = TextEditingController();
    final entitlementDays = TextEditingController(text: '0');
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New leave type'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: code, decoration: const InputDecoration(labelText: 'Code')),
            const SizedBox(height: 12),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 12),
            TextField(
              controller: entitlementDays,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Annual entitlement (days)'),
            ),
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
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        await repo.createLeaveType(
          code: code.text.trim(),
          name: name.text.trim(),
          entitlementDays: double.tryParse(entitlementDays.text.trim()) ?? 0,
        );
        await _refresh();
      },
      success: 'Leave type created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final types = ref.watch(leaveTypesProvider);
    return HrListScaffold(
      title: 'Leave types',
      asyncValue: types,
      itemCount: types.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New leave type',
      emptyHint: 'No leave types — add annual/medical/sick etc.',
      builder: (index) {
        final t = types.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.beach_access),
          title: Text(t.name),
          subtitle: Text('${t.code} · ${t.entitlementDays.toStringAsFixed(1)} days/yr'),
        );
      },
    );
  }
}