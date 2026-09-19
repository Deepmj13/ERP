import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/sales/sales_providers.dart' show productsProvider;
import '../../../../core/widgets/common.dart';

class AdjustmentsPage extends ConsumerStatefulWidget {
  const AdjustmentsPage({super.key});

  @override
  ConsumerState<AdjustmentsPage> createState() => _AdjustmentsPageState();
}

class _AdjustmentsPageState extends ConsumerState<AdjustmentsPage> {
  Future<void> _refresh() async {
    ref.invalidate(stockBalancesProvider);
    ref.invalidate(stockMovementsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final warehouses = await ref.read(warehousesProvider.future);
    final balances = await ref.read(stockBalancesProvider.future);
    final products = await ref.read(productsProvider.future);
    if (!context.mounted) return;

    final warehouseId = ValueNotifier<String?>(null);
    final productId = ValueNotifier<String?>(null);
    final quantity = TextEditingController(text: '0');
    final reason = TextEditingController();
    final stockItems = balances
        .map((b) => (warehouseId: b.warehouseId, productId: b.productId, label: '${b.productName ?? b.sku ?? b.productId} (on hand ${b.available.toStringAsFixed(2)})'))
        .toSet();

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Stock adjustment'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: warehouseId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Warehouse'),
                    isExpanded: true,
                    items: warehouses
                        .where((w) => w.isActive)
                        .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                        .toList(),
                    onChanged: (value) {
                      warehouseId.value = value;
                      productId.value = null;
                    },
                  ),
                ),
                const SizedBox(height: 12),
                ValueListenableBuilder<String?>(
                  valueListenable: warehouseId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: productId.value,
                    hint: const Text('Product'),
                    isExpanded: true,
                    items: [
                      ...stockItems
                          .where((s) => s.warehouseId == selected)
                          .map((s) => DropdownMenuItem(value: s.productId, child: Text(s.label))),
                      ...products
                          .where((p) => !stockItems.any((s) => s.productId == p.id))
                          .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))),
                    ],
                    onChanged: (value) => productId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: quantity,
                  keyboardType: TextInputType.numberWithOptions(signed: true),
                  decoration: const InputDecoration(
                    labelText: 'Quantity change',
                    helperText: 'Positive adds, negative removes',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(controller: reason, decoration: const InputDecoration(labelText: 'Reason')),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Adjust'),
          ),
        ],
      ),
    );
    if (created != true || context.mounted != true || warehouseId.value == null || productId.value == null) return;
    final qty = double.tryParse(quantity.text) ?? 0;
    if (qty == 0) {
      showAppError(context, 'Quantity change must be non-zero');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(inventoryRepositoryProvider).adjust(
              warehouseId: warehouseId.value!,
              productId: productId.value!,
              quantity: qty,
              reason: reason.text.trim().isEmpty ? null : reason.text.trim(),
            );
        await _refresh();
      },
      success: 'Stock adjusted',
    );
  }

  @override
  Widget build(BuildContext context) {
    final movements = ref.watch(stockMovementsProvider);
    final adjustments = (movements.valueOrNull ?? const [])
        .where((m) => m.type == 'ADJUSTMENT' || m.type == 'STOCKTAKE')
        .toList();

    return ListScaffold(
      title: 'Adjustments',
      asyncValue: movements,
      itemCount: adjustments.length,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New adjustment',
      builder: (index) {
        final m = adjustments[index];
        return ListTile(
          leading: const Icon(Icons.tune),
          title: Text('${m.productName ?? m.sku ?? m.productId} — ${m.warehouseName ?? ''}'),
          subtitle: Text('${m.reason ?? ''} · ${(m.createdAt ?? '').substring(0, 10)}'.trim()),
          trailing: Text(
            '${m.quantity >= 0 ? '+' : ''}${m.quantity.toStringAsFixed(2)}',
            style: TextStyle(
              color: m.quantity >= 0 ? Colors.green : Colors.red,
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      },
    );
  }
}