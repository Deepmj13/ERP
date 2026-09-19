import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class VendorPaymentsPage extends ConsumerStatefulWidget {
  const VendorPaymentsPage({super.key});

  @override
  ConsumerState<VendorPaymentsPage> createState() => _VendorPaymentsPageState();
}

class _VendorPaymentsPageState extends ConsumerState<VendorPaymentsPage> {
  Future<void> _refresh() async {
    ref.invalidate(vendorPaymentsProvider);
  }

  /// Create a payment and capture it immediately against the chosen bill.
  Future<void> _createAndCapture(BuildContext context) async {
    final bills = await ref.read(vendorBillsProvider.future);
    if (!context.mounted) return;
    final billId = ValueNotifier<String?>(null);
    final amount = TextEditingController();
    final method = ValueNotifier<String>('BANK');
    final payable = bills.where((b) => b.balance > 0).toList();
    if (payable.isEmpty) {
      if (!context.mounted) return;
      showProcError(context, 'No open vendor bills to pay');
      return;
    }

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New vendor payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String?>(
              valueListenable: billId,
              builder: (context, selected, _) => DropdownButtonFormField<String>(
                initialValue: selected,
                hint: const Text('Bill to pay'),
                isExpanded: true,
                items: payable
                    .map((b) => DropdownMenuItem(
                          value: b.id,
                          child: Text('${b.vendorName ?? ''} — balance ${b.balance.toStringAsFixed(2)}'),
                        ))
                    .toList(),
                onChanged: (value) {
                  billId.value = value;
                  final bill = payable.where((b) => b.id == value).firstOrNull;
                  if (bill != null) amount.text = bill.balance.toStringAsFixed(2);
                },
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount')),
            const SizedBox(height: 12),
            ValueListenableBuilder<String>(
              valueListenable: method,
              builder: (context, selected, _) => DropdownButtonFormField<String>(
                initialValue: selected,
                hint: const Text('Method'),
                items: const [
                  DropdownMenuItem(value: 'BANK', child: Text('Bank')),
                  DropdownMenuItem(value: 'CASH', child: Text('Cash')),
                ],
                onChanged: (value) => method.value = value ?? 'BANK',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Create & capture'),
          ),
        ],
      ),
    );
    if (created != true || context.mounted != true || billId.value == null) return;
    final bill = payable.where((b) => b.id == billId.value).firstOrNull;
    if (bill == null || bill.vendorId == null) return;
    final amt = double.tryParse(amount.text) ?? 0;

    await runAction(
      context,
      () async {
        final repo = ref.read(procurementRepositoryProvider);
        final payment = await repo.createVendorPayment(
          vendorId: bill.vendorId!,
          amount: amt,
          method: method.value,
          allocations: [
            {'vendorBillId': bill.id, 'amount': amt},
          ],
        );
        await repo.capturePayment(
          payment.id,
          allocations: [
            {'vendorBillId': bill.id, 'amount': amt},
          ],
        );
        await _refresh();
      },
      success: 'Payment captured',
    );
  }

  Future<void> _void(String id) => runAction(
        context,
        () async {
          final repo = ref.read(procurementRepositoryProvider);
          await repo.voidPayment(id);
          await _refresh();
        },
        success: 'Payment voided',
      );

  @override
  Widget build(BuildContext context) {
    final payments = ref.watch(vendorPaymentsProvider);
    return ProcListScaffold(
      title: 'Vendor Payments',
      asyncValue: payments,
      itemCount: payments.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _createAndCapture(context),
      onCreateLabel: 'New payment',
      builder: (index) {
        final payment = payments.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.payments_outlined),
          title: Text(payment.number ?? payment.id),
          subtitle: Text('${payment.vendorName ?? ''} — ${payment.amount.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(payment.status),
              if (payment.status == 'PENDING')
                TextButton(onPressed: () => _void(payment.id), child: const Text('Void')),
            ],
          ),
        );
      },
    );
  }
}