import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class PurchaseOrdersPage extends ConsumerStatefulWidget {
  const PurchaseOrdersPage({super.key});

  @override
  ConsumerState<PurchaseOrdersPage> createState() => _PurchaseOrdersPageState();
}

class _PurchaseOrdersPageState extends ConsumerState<PurchaseOrdersPage> {
  Future<void> _refresh() async {
    ref.invalidate(purchaseOrdersProvider);
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
        title: const Text('New purchase order'),
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
        await repo.createPurchaseOrder(
          vendorId: vendorId.value!,
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
      success: 'Order created',
    );
  }

  Future<void> _transition(String id, String action, String success) => runAction(
        context,
        () async {
          final repo = ref.read(procurementRepositoryProvider);
          switch (action) {
            case 'submit':
              await repo.submitOrder(id);
            case 'approve':
              await repo.approveOrder(id);
            default:
              await repo.cancelOrder(id);
          }
          await _refresh();
        },
        success: success,
      );

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(purchaseOrdersProvider);
    return ProcListScaffold(
      title: 'Purchase Orders',
      asyncValue: orders,
      itemCount: orders.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New order',
      builder: (index) {
        final order = orders.valueOrNull![index];
        final currency = order.currency ?? 'USD';
        return ListTile(
          leading: const Icon(Icons.shopping_cart),
          title: Text(order.number ?? order.id),
          subtitle: Text('${order.vendorName ?? ''} — ${order.itemCount} item(s) — $currency ${order.total.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(order.status),
              if (order.status == 'DRAFT')
                _Action(label: 'Submit', onTap: () => _transition(order.id, 'submit', 'Submitted')),
              if (order.status == 'SUBMITTED') ...[
                _Action(label: 'Approve', onTap: () => _transition(order.id, 'approve', 'Approved')),
                _Action(label: 'Cancel', onTap: () => _transition(order.id, 'cancel', 'Cancelled')),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(onPressed: onTap, child: Text(label));
  }
}