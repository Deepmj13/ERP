import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class VendorBillsPage extends ConsumerStatefulWidget {
  const VendorBillsPage({super.key});

  @override
  ConsumerState<VendorBillsPage> createState() => _VendorBillsPageState();
}

class _VendorBillsPageState extends ConsumerState<VendorBillsPage> {
  Future<void> _refresh() async {
    ref.invalidate(vendorBillsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final vendors = await ref.read(vendorsProvider.future);
    if (!context.mounted) return;
    final vendorId = ValueNotifier<String?>(null);
    final description = TextEditingController();
    final quantity = TextEditingController(text: '1');
    final unitPrice = TextEditingController(text: '0');

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New vendor bill'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String?>(
              valueListenable: vendorId,
              builder: (context, selected, _) => DropdownButtonFormField<String>(
                initialValue: selected,
                hint: const Text('Vendor'),
                isExpanded: true,
                items: vendors
                    .map((v) => DropdownMenuItem(value: v.id, child: Text(v.name)))
                    .toList(),
                onChanged: (value) => vendorId.value = value,
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
            const SizedBox(height: 12),
            TextField(controller: quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity')),
            const SizedBox(height: 12),
            TextField(controller: unitPrice, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Unit price')),
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
    if (created != true || context.mounted != true || vendorId.value == null) return;
    await runAction(
      context,
      () async {
        final repo = ref.read(procurementRepositoryProvider);
        await repo.createVendorBill(
          vendorId: vendorId.value!,
          issueDate: DateTime.now().toIso8601String(),
          items: [
            {
              'description': description.text.trim(),
              'quantity': double.tryParse(quantity.text) ?? 1,
              'unitPrice': double.tryParse(unitPrice.text) ?? 0,
            },
          ],
        );
        await _refresh();
      },
      success: 'Bill created',
    );
  }

  Future<void> _transition(String id, String action, String success) => runAction(
        context,
        () async {
          final repo = ref.read(procurementRepositoryProvider);
          switch (action) {
            case 'submit':
              await repo.submitBill(id);
            case 'approve':
              await repo.approveBill(id);
            default:
              await repo.postBill(id);
          }
          await _refresh();
        },
        success: success,
      );

  @override
  Widget build(BuildContext context) {
    final bills = ref.watch(vendorBillsProvider);
    return ProcListScaffold(
      title: 'Vendor Bills',
      asyncValue: bills,
      itemCount: bills.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New bill',
      builder: (index) {
        final bill = bills.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.receipt_long),
          title: Text(bill.number ?? bill.id),
          subtitle: Text('${bill.vendorName ?? ''} — ${bill.total.toStringAsFixed(2)} / balance ${bill.balance.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(bill.status),
              if (bill.status == 'DRAFT')
                TextButton(onPressed: () => _transition(bill.id, 'submit', 'Submitted'), child: const Text('Submit')),
              if (bill.status == 'SUBMITTED')
                TextButton(onPressed: () => _transition(bill.id, 'approve', 'Approved'), child: const Text('Approve')),
              if (bill.status == 'APPROVED')
                TextButton(onPressed: () => _transition(bill.id, 'post', 'Posted (A/P)'), child: const Text('Post')),
            ],
          ),
        );
      },
    );
  }
}