import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/inventory/inventory_providers.dart';
import '../../../../core/inventory/inventory_models.dart';
import '../../../../core/widgets/common.dart';

class TransfersPage extends ConsumerStatefulWidget {
  const TransfersPage({super.key});

  @override
  ConsumerState<TransfersPage> createState() => _TransfersPageState();
}

class _TransfersPageState extends ConsumerState<TransfersPage> {
  Future<void> _refresh() async {
    ref.invalidate(stockMovementsProvider);
  }

  Future<void> _create(BuildContext context) async {
    final ctx = context;
    final warehouses = await ref.read(warehousesProvider.future);
    final balances = await ref.read(stockBalancesProvider.future);
    if (!ctx.mounted) return;

    final lines = <Map<String, dynamic>>[];
    var openDialog = true;

    while (openDialog && ctx.mounted) {
      final fromId = ValueNotifier<String?>(null);
      final toId = ValueNotifier<String?>(null);
      final productId = ValueNotifier<String?>(null);
      final quantity = TextEditingController(text: '1');
      final reason = TextEditingController();
      final available = ValueNotifier<double>(0);

      void applyAvailable(String? w, String? p) {
        final match = balances.where((b) => b.warehouseId == w && b.productId == p).toList();
        available.value = match.isEmpty ? 0 : match.first.available;
      }

      final added = await showDialog<bool>(
        context: ctx,
        builder: (context) => AlertDialog(
          title: const Text('Transfer line'),
          content: SizedBox(
            width: 480,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ValueListenableBuilder<String?>(
                    valueListenable: fromId,
                    builder: (context, selected, _) => DropdownButtonFormField<String>(
                      initialValue: selected,
                      hint: const Text('From warehouse'),
                      isExpanded: true,
                      items: warehouses
                          .where((w) => w.isActive)
                          .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                          .toList(),
                      onChanged: (value) {
                        fromId.value = value;
                        if (value == toId.value) toId.value = null;
                        applyAvailable(value, productId.value);
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  ValueListenableBuilder<String?>(
                    valueListenable: toId,
                    builder: (context, selected, _) => DropdownButtonFormField<String>(
                      initialValue: selected,
                      hint: const Text('To warehouse'),
                      isExpanded: true,
                      items: warehouses
                          .where((w) => w.isActive && w.id != fromId.value)
                          .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                          .toList(),
                      onChanged: (value) {
                        toId.value = value;
                        if (value == fromId.value) fromId.value = null;
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  ValueListenableBuilder<String?>(
                    valueListenable: fromId,
                    builder: (context, selected, _) => DropdownButtonFormField<String>(
                      initialValue: productId.value,
                      hint: const Text('Product'),
                      isExpanded: true,
                      items: balances
                          .where((b) => b.warehouseId == selected)
                          .map((b) => DropdownMenuItem(
                                value: b.productId,
                                child: Text(
                                  '${b.productName ?? b.sku ?? b.productId} (on hand ${b.available.toStringAsFixed(2)})',
                                ),
                              ))
                          .toList(),
                      onChanged: (value) {
                        productId.value = value;
                        applyAvailable(selected, value);
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  ValueListenableBuilder<double>(
                    valueListenable: available,
                    builder: (context, avail, _) => TextField(
                      controller: quantity,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        labelText: 'Quantity',
                        helperText: 'Available: ${avail.toStringAsFixed(2)}',
                      ),
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
              child: const Text('Add line'),
            ),
          ],
        ),
      );
      if (added != true || fromId.value == null || toId.value == null || productId.value == null) break;
      final qty = double.tryParse(quantity.text) ?? 0;
      if (qty <= 0) {
        if (!ctx.mounted) return;
        showAppError(ctx, 'Quantity must be positive');
        continue;
      }
      lines.add({
        'productId': productId.value!,
        'fromWarehouseId': fromId.value!,
        'toWarehouseId': toId.value!,
        'quantity': qty,
        'reason': reason.text.trim().isEmpty ? null : reason.text.trim(),
      });
    }

    if (lines.isEmpty || !ctx.mounted) return;
    await runAction(
      ctx,
      () async {
        await ref.read(inventoryRepositoryProvider).transfer(lines);
        await _refresh();
      },
      success: 'Transfer posted',
    );
  }

  @override
  Widget build(BuildContext context) {
    final movements = ref.watch(stockMovementsProvider);
    final transfers = (movements.valueOrNull ?? const <StockMovement>[])
        .where((m) => m.type == 'TRANSFER_OUT' || m.type == 'TRANSFER_IN')
        .toList();

    return ListScaffold(
      title: 'Transfers',
      asyncValue: movements,
      itemCount: transfers.length,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New transfer',
      builder: (index) {
        final m = transfers[index];
        return ListTile(
          leading: const Icon(Icons.swap_horiz),
          title: Text(m.productName ?? m.sku ?? m.productId),
          subtitle: Text(
            '${m.type} · ${m.warehouseName ?? ''} · ${m.reason ?? ''} · ${(m.createdAt ?? '').substring(0, 10)}'
                .replaceAll(RegExp(r'\s+'), ' ')
                .trim(),
          ),
          trailing: Text(m.quantity.toStringAsFixed(2)),
        );
      },
    );
  }
}