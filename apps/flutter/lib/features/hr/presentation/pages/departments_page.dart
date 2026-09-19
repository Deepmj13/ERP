import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

class DepartmentsPage extends ConsumerStatefulWidget {
  const DepartmentsPage({super.key});

  @override
  ConsumerState<DepartmentsPage> createState() => _DepartmentsPageState();
}

class _DepartmentsPageState extends ConsumerState<DepartmentsPage> {
  Future<void> _refresh() async {
    ref.invalidate(departmentsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final code = TextEditingController();
    final name = TextEditingController();
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New department'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: code, decoration: const InputDecoration(labelText: 'Code')),
            const SizedBox(height: 12),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
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
        await repo.createDepartment(code: code.text.trim(), name: name.text.trim());
        await _refresh();
      },
      success: 'Department created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final departments = ref.watch(departmentsProvider);
    return HrListScaffold(
      title: 'Departments',
      asyncValue: departments,
      itemCount: departments.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New department',
      emptyHint: 'No departments yet.',
      builder: (index) {
        final d = departments.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.account_tree),
          title: Text(d.name),
          subtitle: Row(
            children: [
              Chip(
                label: Text(d.code),
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              if (d.parentId != null) ...[
                const SizedBox(width: 8),
                const Icon(Icons.subdirectory_arrow_right, size: 16),
              ],
            ],
          ),
        );
      },
    );
  }
}