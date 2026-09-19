import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/ops/ops_models.dart';
import '../../../../core/ops/ops_providers.dart';
import '../../../../core/sales/sales_providers.dart';
import '../../../../core/widgets/common.dart';

class ProjectsPage extends ConsumerWidget {
  const ProjectsPage({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(projectsProvider);
    ref.invalidate(kpisProvider);
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final customers = await ref.read(customersProvider.future);
    if (!context.mounted) return;
    final code = TextEditingController();
    final name = TextEditingController();
    final budget = TextEditingController();
    final customerId = ValueNotifier<String?>(null);

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New project'),
        content: SizedBox(
          width: 460,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(controller: code, decoration: const InputDecoration(labelText: 'Code')),
                const SizedBox(height: 12),
                TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
                const SizedBox(height: 12),
                ValueListenableBuilder<String?>(
                  valueListenable: customerId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Customer (optional)'),
                    isExpanded: true,
                    items: customers
                        .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                        .toList(),
                    onChanged: (value) => customerId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: budget,
                  decoration: const InputDecoration(labelText: 'Budget'),
                  keyboardType: TextInputType.number,
                ),
              ],
            ),
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
        await ref.read(opsRepositoryProvider).createProject(
              code: code.text.trim(),
              name: name.text.trim(),
              customerId: customerId.value,
              budget: double.tryParse(budget.text),
            );
        await _refresh(ref);
      },
      success: 'Project created',
    );
  }

  Future<void> _showDetail(BuildContext context, WidgetRef ref, Project p) async {
    final ctx = context;
    final doc = await ref.read(opsRepositoryProvider).project(p.id);
    if (!ctx.mounted) return;
    final tasks = doc['tasks'] is List<dynamic> ? doc['tasks'] as List<dynamic> : const [];
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        builder: (context, scrollController) => ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(16),
          children: [
            Text('${p.code} — ${p.name}', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            StatusChip(p.status),
            if (p.customerName != null) Text('Customer: ${p.customerName}'),
            if (p.budget != null) Text('Budget: ${p.budget!.toStringAsFixed(2)}'),
            if (p.startDate != null) Text('Start: ${p.startDate}'),
            if (p.endDate != null) Text('End: ${p.endDate}'),
            const SizedBox(height: 16),
            Text('Tasks (${tasks.length})', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final t in tasks)
              if (t is Map<String, dynamic>)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.check_circle_outline),
                  title: Text(t['title'] as String? ?? ''),
                  subtitle: Text(t['status'] as String? ?? ''),
                ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    return ListScaffold(
      title: 'Projects',
      asyncValue: projects,
      itemCount: projects.valueOrNull?.length ?? 0,
      onRefresh: () => _refresh(ref),
      onCreate: () => _create(context, ref),
      onCreateLabel: 'New project',
      emptyHint: 'No projects yet — create the first one.',
      builder: (index) {
        final p = projects.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.folder_outlined),
          title: Text('${p.code} — ${p.name}'),
          subtitle: Text(
            [p.customerName ?? '', '${p.taskCount} task(s)']
                .where((e) => e.isNotEmpty)
                .join(' · '),
          ),
          trailing: StatusChip(p.status),
          onTap: () => _showDetail(context, ref, p),
        );
      },
    );
  }
}