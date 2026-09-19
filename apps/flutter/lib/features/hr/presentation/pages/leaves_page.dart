import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_models.dart';
import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

class LeavesPage extends ConsumerStatefulWidget {
  const LeavesPage({super.key});

  @override
  ConsumerState<LeavesPage> createState() => _LeavesPageState();
}

class _LeavesPageState extends ConsumerState<LeavesPage> {
  bool _mine = false;

  Future<void> _refresh() async {
    ref.invalidate(leavesProvider);
    ref.invalidate(myLeavesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final employees = await ref.read(employeesProvider.future);
    final types = await ref.read(leaveTypesProvider.future);
    if (!context.mounted) return;
    if (employees.isEmpty || types.isEmpty) {
      showHrError(context, 'Hire an employee and add a leave type first');
      return;
    }
    final employeeId = ValueNotifier<String?>(employees.first.id);
    final leaveTypeId = ValueNotifier<String?>(types.first.id);
    final startDate = TextEditingController();
    final endDate = TextEditingController();
    final reason = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New leave request'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ValueListenableBuilder<String?>(
                valueListenable: employeeId,
                builder: (context, value, _) => DropdownButtonFormField<String?>(
                  initialValue: value,
                  decoration: const InputDecoration(labelText: 'Employee'),
                  items: employees
                      .map((e) => DropdownMenuItem<String?>(value: e.id, child: Text('${e.employeeNo} — ${e.fullName}')))
                      .toList(),
                  onChanged: (v) => employeeId.value = v,
                ),
              ),
              const SizedBox(height: 12),
              ValueListenableBuilder<String?>(
                valueListenable: leaveTypeId,
                builder: (context, value, _) => DropdownButtonFormField<String?>(
                  initialValue: value,
                  decoration: const InputDecoration(labelText: 'Leave type'),
                  items: types.map((t) => DropdownMenuItem<String?>(value: t.id, child: Text(t.name))).toList(),
                  onChanged: (v) => leaveTypeId.value = v,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: startDate,
                decoration: const InputDecoration(labelText: 'Start date', hintText: 'YYYY-MM-DD'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: endDate,
                decoration: const InputDecoration(labelText: 'End date', hintText: 'YYYY-MM-DD'),
              ),
              const SizedBox(height: 12),
              TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason (optional)')),
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
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        await repo.createLeave(
          employeeId: employeeId.value!,
          leaveTypeId: leaveTypeId.value!,
          startDate: startDate.text.trim(),
          endDate: endDate.text.trim(),
          reason: reason.text.trim().isEmpty ? null : reason.text.trim(),
        );
        await _refresh();
      },
      success: 'Leave request created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final leaves = ref.watch(_mine ? myLeavesProvider : leavesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Leave requests'),
        actions: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment<bool>(value: false, label: Text('All')),
              ButtonSegment<bool>(value: true, label: Text('Mine')),
            ],
            selected: {_mine},
            onSelectionChanged: (set) => setState(() => _mine = set.first),
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _create(context),
        icon: const Icon(Icons.add),
        label: const Text('New request'),
      ),
      body: switch (leaves) {
        AsyncValue(:final error?) => _ErrorView(error: error, onRetry: _refresh),
        AsyncValue(value: null) => const Center(child: CircularProgressIndicator()),
        _ when (leaves.valueOrNull?.length ?? 0) == 0 => const Center(
            child: Text('No leave requests yet.'),
          ),
        _ => RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(bottom: 96),
              itemCount: leaves.valueOrNull?.length ?? 0,
              itemBuilder: (context, index) {
                final leave = leaves.valueOrNull![index];
                return _LeaveTile(
                  leave: leave,
                  onApprove: leave.status == 'PENDING'
                      ? () => _transition(context, leave.id, 'approve', 'Leave approved')
                      : null,
                  onReject: leave.status == 'PENDING'
                      ? () => _transition(context, leave.id, 'reject', 'Leave rejected')
                      : null,
                  onCancel: ['DRAFT', 'PENDING'].contains(leave.status)
                      ? () => _transition(context, leave.id, 'cancel', 'Leave cancelled')
                      : null,
                );
              },
            ),
          ),
      },
    );
  }

  Future<void> _transition(BuildContext context, String id, String action, String success) async {
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        switch (action) {
          case 'approve':
            await repo.approveLeave(id);
          case 'reject':
            await repo.rejectLeave(id);
          case 'cancel':
            await repo.cancelLeave(id);
        }
        await _refresh();
      },
      success: success,
    );
  }
}

class _LeaveTile extends StatelessWidget {
  const _LeaveTile({
    required this.leave,
    required this.onApprove,
    required this.onReject,
    required this.onCancel,
  });

  final Leave leave;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final number = leave.days.toStringAsFixed(1);
    return ListTile(
      leading: const Icon(Icons.event),
      title: Text(leave.employeeName ?? leave.employeeId),
      subtitle: Text(
        '${leave.leaveTypeName ?? ''} · $number days · ${leave.startDate.toString().split('T').first} → ${leave.endDate.toString().split('T').first}',
      ),
      trailing: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          StatusChip(leave.status),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (onApprove != null)
                IconButton(icon: const Icon(Icons.check, color: Colors.green), onPressed: onApprove, tooltip: 'Approve'),
              if (onReject != null)
                IconButton(icon: const Icon(Icons.close, color: Colors.red), onPressed: onReject, tooltip: 'Reject'),
              if (onCancel != null)
                IconButton(icon: const Icon(Icons.cancel_outlined), onPressed: onCancel, tooltip: 'Cancel'),
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, this.onRetry});
  final Object error;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 40),
          const SizedBox(height: 8),
          Text('$error'),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ],
      ),
    );
  }
}