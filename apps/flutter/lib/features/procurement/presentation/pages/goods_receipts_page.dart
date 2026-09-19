import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/procurement/procurement_providers.dart';
import '../widgets/procurement_widgets.dart';

class GoodsReceiptsPage extends ConsumerStatefulWidget {
  const GoodsReceiptsPage({super.key});

  @override
  ConsumerState<GoodsReceiptsPage> createState() => _GoodsReceiptsPageState();
}

class _GoodsReceiptsPageState extends ConsumerState<GoodsReceiptsPage> {
  Future<void> _refresh() async {
    ref.invalidate(goodsReceiptsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final orders = await ref.read(purchaseOrdersProvider.future);
    if (!context.mounted) return;
    final orderId = ValueNotifier<String?>(null);
    final description = TextEditingController();
    final quantity = TextEditingController(text: '1');
    final unitCost = TextEditingController(text: '0');
    final receivable = orders.where((o) => ['APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].contains(o.status)).toList();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New goods receipt'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ValueListenableBuilder<String?>(
              valueListenable: orderId,
              builder: (context, selected, _) => DropdownButtonFormField<String>(
                initialValue: selected,
                hint: const Text('Purchase order'),
                isExpanded: true,
                items: receivable
                    .map((o) => DropdownMenuItem(value: o.id, child: Text(o.number ?? o.id)))
                    .toList(),
                onChanged: (value) => orderId.value = value,
              ),
            ),
            const SizedBox(height: 12),
            TextField(controller: description, decoration: const InputDecoration(labelText: 'Description')),
            const SizedBox(height: 12),
            TextField(controller: quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity')),
            const SizedBox(height: 12),
            TextField(controller: unitCost, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Unit cost')),
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
    if (created != true || context.mounted != true || orderId.value == null) return;
    await runAction(
      context,
      () async {
        final repo = ref.read(procurementRepositoryProvider);
        await repo.createGoodsReceipt(
          purchaseOrderId: orderId.value!,
          items: [
            {
              'description': description.text.trim(),
              'quantity': double.tryParse(quantity.text) ?? 1,
              'unitCost': double.tryParse(unitCost.text) ?? 0,
            },
          ],
        );
        await _refresh();
      },
      success: 'GRN created',
    );
  }

  Future<void> _post(String id) => runAction(
        context,
        () async {
          final repo = ref.read(procurementRepositoryProvider);
          await repo.postGoodsReceipt(id);
          await _refresh();
        },
        success: 'Goods received',
      );

  @override
  Widget build(BuildContext context) {
    final receipts = ref.watch(goodsReceiptsProvider);
    return ProcListScaffold(
      title: 'Goods Receipts',
      asyncValue: receipts,
      itemCount: receipts.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New receipt',
      builder: (index) {
        final receipt = receipts.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.inventory_2),
          title: Text(receipt.number ?? receipt.id),
          subtitle: Text('${receipt.orderNumber ?? ''} — ${receipt.itemCount} item(s)'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(receipt.status),
              if (receipt.status == 'DRAFT')
                TextButton(onPressed: () => _post(receipt.id), child: const Text('Post')),
            ],
          ),
        );
      },
    );
  }
}