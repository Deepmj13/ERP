import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

class EmployeesPage extends ConsumerStatefulWidget {
  const EmployeesPage({super.key});

  @override
  ConsumerState<EmployeesPage> createState() => _EmployeesPageState();
}

class _EmployeesPageState extends ConsumerState<EmployeesPage> {
  Future<void> _refresh() async {
    ref.invalidate(employeesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final employeeNo = TextEditingController();
    final firstName = TextEditingController();
    final lastName = TextEditingController();
    final jobTitle = TextEditingController();
    final departmentId = ValueNotifier<String?>(null);
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => _EmployeeForm(
        employeeNo: employeeNo,
        firstName: firstName,
        lastName: lastName,
        jobTitle: jobTitle,
        departmentId: departmentId,
      ),
    );
    if (created != true || context.mounted != true) return;
    await runAction(
      context,
      () async {
        final repo = ref.read(hrRepositoryProvider);
        await repo.createEmployee(
          employeeNo: employeeNo.text.trim(),
          firstName: firstName.text.trim(),
          lastName: lastName.text.trim(),
          jobTitle: jobTitle.text.trim().isEmpty ? null : jobTitle.text.trim(),
          departmentId: departmentId.value,
        );
        await _refresh();
      },
      success: 'Employee created',
    );
  }

  @override
  Widget build(BuildContext context) {
    final employees = ref.watch(employeesProvider);
    return HrListScaffold(
      title: 'Employees',
      asyncValue: employees,
      itemCount: employees.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'Hire employee',
      emptyHint: 'No employees yet — hire your first one.',
      builder: (index) {
        final e = employees.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.person),
          title: Text(e.fullName),
          subtitle: Text(
            [e.employeeNo, e.jobTitle, e.departmentName]
                .where((s) => s != null && s.isNotEmpty)
                .join(' · '),
          ),
          trailing: StatusChip(e.status),
        );
      },
    );
  }
}

class _EmployeeForm extends ConsumerWidget {
  const _EmployeeForm({
    required this.employeeNo,
    required this.firstName,
    required this.lastName,
    required this.jobTitle,
    required this.departmentId,
  });

  final TextEditingController employeeNo;
  final TextEditingController firstName;
  final TextEditingController lastName;
  final TextEditingController jobTitle;
  final ValueNotifier<String?> departmentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final departments = ref.watch(departmentsProvider);
    return AlertDialog(
      title: const Text('New employee'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: employeeNo, decoration: const InputDecoration(labelText: 'Employee no')),
            const SizedBox(height: 12),
            TextField(controller: firstName, decoration: const InputDecoration(labelText: 'First name')),
            const SizedBox(height: 12),
            TextField(controller: lastName, decoration: const InputDecoration(labelText: 'Last name')),
            const SizedBox(height: 12),
            TextField(controller: jobTitle, decoration: const InputDecoration(labelText: 'Job title (optional)')),
            const SizedBox(height: 12),
            ValueListenableBuilder<String?>(
              valueListenable: departmentId,
              builder: (context, value, _) => DropdownButtonFormField<String?>(
                initialValue: value,
                decoration: const InputDecoration(labelText: 'Department'),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('— none —')),
                  ...departments.valueOrNull?.map(
                        (d) => DropdownMenuItem<String?>(value: d.id, child: Text(d.name)),
                      ) ??
                      [],
                ],
                onChanged: (v) => departmentId.value = v,
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
    );
  }
}