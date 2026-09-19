import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/hr/hr_providers.dart';
import '../widgets/hr_widgets.dart';

/// Salary structure list + create (Phase 7b). One structure per employee per
/// effective date; the active/latest structure drives payroll calculation.
class SalaryStructuresPage extends ConsumerStatefulWidget {
  const SalaryStructuresPage({super.key});

  @override
  ConsumerState<SalaryStructuresPage> createState() => _SalaryStructuresPageState();
}

class _SalaryStructuresPageState extends ConsumerState<SalaryStructuresPage> {
  Future<void> _refresh() => ref.refresh(salaryStructuresProvider.future).then((_) {});

  Future<void> _create(BuildContext context) async {
    final employees = await ref.read(employeesProvider.future);
    if (!context.mounted) return;
    if (employees.isEmpty) {
      showHrError(context, 'Hire an employee before setting a salary');
      return;
    }
    final employeeId = ValueNotifier<String?>(employees.first.id);
    final effectiveDate = TextEditingController();
    final basicSalary = TextEditingController();
    final notes = TextEditingController();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New salary structure'),
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
                      .map((e) => DropdownMenuItem<String?>(
                          value: e.id, child: Text('${e.employeeNo} — ${e.fullName}')))
                      .toList(),
                  onChanged: (v) => employeeId.value = v,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: effectiveDate,
                decoration: const InputDecoration(labelText: 'Effective date', hintText: 'YYYY-MM-DD'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: basicSalary,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Basic salary (USD)'),
              ),
              const SizedBox(height: 12),
              TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes (optional)')),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Save')),
        ],
      ),
    );
    if (created != true || context.mounted != true) return;
    await runAction(
      context,
      () async {
        final salary = double.tryParse(basicSalary.text.trim());
        if (salary == null || salary < 0) {
          throw ArgumentError('Enter a valid non-negative basic salary');
        }
        if (effectiveDate.text.trim().isEmpty) {
          throw ArgumentError('Effective date is required');
        }
        final repo = ref.read(hrRepositoryProvider);
        await repo.createSalaryStructure(
          employeeId: employeeId.value!,
          effectiveDate: effectiveDate.text.trim(),
          basicSalary: salary,
          payStructureNotes: notes.text.trim().isEmpty ? null : notes.text.trim(),
        );
        await _refresh();
      },
      success: 'Salary structure saved',
    );
  }

  @override
  Widget build(BuildContext context) {
    final structures = ref.watch(salaryStructuresProvider);
    return HrListScaffold(
      title: 'Salary Structures',
      asyncValue: structures,
      itemCount: structures.valueOrNull?.length ?? 0,
      emptyHint: 'No salary structures yet — create one to pay employees.',
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New salary',
      builder: (index) {
        final structure = structures.valueOrNull![index];
        final allowances = structure.allowances.values
            .map((v) => _componentAmount(v))
            .fold<double>(0, (sum, v) => sum + v);
        return ListTile(
          leading: const Icon(Icons.paid_outlined),
          title: Text(structure.employeeName ?? structure.employeeId),
          subtitle: Text(
            '${structure.employeeNo ?? ''} · since ${structure.effectiveDate.toString().split('T').first} · ${_fmt(structure.basicSalary)} ${structure.currency}',
          ),
          trailing: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(structure.isActive ? 'ACTIVE' : 'INACTIVE'),
              const SizedBox(height: 4),
              Text('+ ${_fmt(allowances)} allowances', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        );
      },
    );
  }
}

double _componentAmount(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? 0;
  if (value is Map) {
    final amount = value['amount'];
    if (amount is num) return amount.toDouble();
    if (amount is String) return double.tryParse(amount) ?? 0;
    final inner = value['value'];
    if (inner is num) return inner.toDouble();
    if (inner is String) return double.tryParse(inner) ?? 0;
  }
  return 0;
}

String _fmt(double value) {
  final parts = value.toStringAsFixed(2).split('.');
  final digits = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '$digits.${parts[1]}';
}