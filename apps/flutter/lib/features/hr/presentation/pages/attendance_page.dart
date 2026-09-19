import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

class AttendancePage extends ConsumerStatefulWidget {
  const AttendancePage({super.key});

  @override
  ConsumerState<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends ConsumerState<AttendancePage> {
  Future<void> _refresh() async {
    ref.invalidate(attendanceProvider);
  }

  Future<void> _punch(BuildContext context) async {
    final entryEmployees = await ref.read(employeesProvider.future);
    if (!context.mounted) return;
    final employeeId = ValueNotifier<String?>(entryEmployees.isNotEmpty ? entryEmployees.first.id : null);
    final today = DateTime.now();
    final workDate = TextEditingController(text: _dateOnly(today));
    final checkIn = TextEditingController(text: _dateOnly(today));
    final checkOut = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Punch attendance'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String?>(
              valueListenable: employeeId,
              builder: (context, value, _) => DropdownButtonFormField<String?>(
                initialValue: value,
                decoration: const InputDecoration(labelText: 'Employee'),
                items: [
                  ...entryEmployees
                      .map((e) => DropdownMenuItem<String?>(value: e.id, child: Text('${e.employeeNo} — ${e.fullName}'))),
                ],
                onChanged: (v) => employeeId.value = v,
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: workDate, decoration: const InputDecoration(labelText: 'Work date')),
            const SizedBox(height: 12),
            TextField(controller: checkIn, decoration: const InputDecoration(labelText: 'Check-in')),
            const SizedBox(height: 12),
            TextField(controller: checkOut, decoration: const InputDecoration(labelText: 'Check-out (optional)')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Punch'),
          ),
        ],
      ),
    );
    if (created != true || context.mounted != true) return;
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        await repo.punchAttendance(
          employeeId: employeeId.value!,
          workDate: workDate.text.trim(),
          checkIn: checkIn.text.trim().isEmpty ? null : checkIn.text.trim(),
          checkOut: checkOut.text.trim().isEmpty ? null : checkOut.text.trim(),
        );
        await _refresh();
      },
      success: 'Punch saved',
    );
  }

  @override
  Widget build(BuildContext context) {
    final records = ref.watch(attendanceProvider);
    return HrListScaffold(
      title: 'Attendance',
      asyncValue: records,
      itemCount: records.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _punch(context),
      onCreateLabel: 'Punch',
      emptyHint: 'No attendance records.',
      builder: (index) {
        final r = records.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.access_time),
          title: Text(r.employeeName ?? r.employeeId),
          subtitle: Text(
            '${_shortDate(r.workDate)} · in ${_clock(r.checkIn)} · out ${_clock(r.checkOut)}',
          ),
          trailing: StatusChip(r.status),
        );
      },
    );
  }

  static String _dateOnly(DateTime d) => d.toIso8601String().split('T').first;

  static String _shortDate(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? iso : '${d.year}-${_pad(d.month)}-${_pad(d.day)}';
  }

  static String _clock(String? iso) {
    if (iso == null) return '—';
    final d = DateTime.tryParse(iso);
    return d == null ? iso : '${_pad(d.hour)}:${_pad(d.minute)}';
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');
}