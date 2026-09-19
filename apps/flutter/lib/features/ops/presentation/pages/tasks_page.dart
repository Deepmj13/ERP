import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/ops/ops_models.dart';
import '../../../../core/ops/ops_providers.dart';
import '../../../../core/widgets/common.dart';

const Map<String, IconData> _priorityIcons = {
  'LOW': Icons.arrow_downward,
  'MEDIUM': Icons.remove,
  'HIGH': Icons.arrow_upward,
  'URGENT': Icons.warning,
};

class TasksPage extends ConsumerStatefulWidget {
  const TasksPage({super.key});

  @override
  ConsumerState<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends ConsumerState<TasksPage> {
  Future<void> _refresh() async {
    ref.invalidate(tasksProvider);
  }

  Future<void> _create() async {
    final projects = await ref.read(projectsProvider.future);
    if (!mounted) return;
    final projectId = ValueNotifier<String?>(projects.isEmpty ? null : projects.first.id);
    final title = TextEditingController();
    final priority = ValueNotifier<String>('MEDIUM');

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New task'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: projectId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Project'),
                    isExpanded: true,
                    items: projects
                        .map((p) => DropdownMenuItem(value: p.id, child: Text('${p.code} — ${p.name}')))
                        .toList(),
                    onChanged: (value) => projectId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
                const SizedBox(height: 12),
                ValueListenableBuilder<String>(
                  valueListenable: priority,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    items: const [
                      DropdownMenuItem(value: 'LOW', child: Text('Low')),
                      DropdownMenuItem(value: 'MEDIUM', child: Text('Medium')),
                      DropdownMenuItem(value: 'HIGH', child: Text('High')),
                      DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
                    ],
                    onChanged: (value) => priority.value = value ?? 'MEDIUM',
                  ),
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
    if (created != true || !mounted) return;
    if (projectId.value == null || title.text.trim().isEmpty) {
      showAppError(context, 'Project and title are required');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(opsRepositoryProvider).createTask(
              projectId: projectId.value!,
              title: title.text.trim(),
              priority: priority.value,
            );
        await _refresh();
      },
      success: 'Task created',
    );
  }

  Future<void> _advance(ProjectTask task, String status, String label) => runAction(
        context,
        () async {
          await ref.read(opsRepositoryProvider).setTaskStatus(task.id, status);
          await _refresh();
        },
        success: label,
      );

  static const List<({String to, String label})> _moves = [
    (to: 'IN_PROGRESS', label: 'Start'),
    (to: 'IN_REVIEW', label: 'Review'),
    (to: 'DONE', label: 'Close'),
  ];

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(tasksProvider);
    return ListScaffold(
      title: 'Tasks',
      asyncValue: tasks,
      itemCount: tasks.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: _create,
      onCreateLabel: 'New task',
      emptyHint: 'No tasks yet — create the first one.',
      builder: (index) {
        final task = tasks.valueOrNull![index];
        final next = _moves
            .where((m) =>
                task.status == 'TODO' && m.to == 'IN_PROGRESS' ||
                task.status == 'IN_PROGRESS' && m.to == 'IN_REVIEW' && m.label == 'Review' ||
                task.status == 'IN_REVIEW' && m.to == 'DONE' && m.label == 'Close')
            .take(1)
            .toList();
        final canCancel = task.status != 'DONE' && task.status != 'CANCELLED';
        return ListTile(
          leading: Icon(_priorityIcons[task.priority] ?? Icons.remove,
              color: task.priority == 'HIGH' || task.priority == 'URGENT'
                  ? Colors.deepOrange
                  : null),
          title: Text(task.title),
          subtitle: Text(
            [task.projectName ?? '', task.priority].where((e) => e.isNotEmpty).join(' · '),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(task.status),
              if (next.isNotEmpty)
                TextButton(
                  onPressed: () => _advance(task, next.first.to, 'Task ${next.first.label.toLowerCase()}d'),
                  child: Text(next.first.label),
                ),
              if (canCancel)
                TextButton(
                  onPressed: () => _advance(task, 'CANCELLED', 'Task cancelled'),
                  child: const Text('Cancel'),
                ),
            ],
          ),
        );
      },
    );
  }
}