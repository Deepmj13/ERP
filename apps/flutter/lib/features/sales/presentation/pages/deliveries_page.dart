import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/sales/sales_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/sales_widgets.dart';

class DeliveriesPage extends ConsumerStatefulWidget {
  const DeliveriesPage({super.key});

  @override
  ConsumerState<DeliveriesPage> createState() => _DeliveriesPageState();
}

class _DeliveriesPageState extends ConsumerState<DeliveriesPage> {
  Future<void> _refresh() async {
    ref.invalidate(deliveriesProvider);
  }

  Future<void> _create(BuildContext context) async {
    final orders = await ref.read(salesOrdersProvider.future);
    final warehouses = await ref.read(warehousesProvider.future);
    final products = await ref.read(productsProvider.future);
    if (!context.mounted) return;
    final approvedOrders = orders.where((o) => o.status == 'APPROVED').toList();
    final orderId = ValueNotifier<String?>(approvedOrders.isNotEmpty ? approvedOrders.first.id : null);
    final warehouseId = ValueNotifier<String?>(null);
    var items = <Map<String, dynamic>>[];

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New delivery'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: orderId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Approved sales order'),
                    isExpanded: true,
                    items: approvedOrders
                        .map((o) => DropdownMenuItem(value: o.id, child: Text(o.number ?? o.id)))
                        .toList(),
                    onChanged: (value) => orderId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                ValueListenableBuilder<String?>(
                  valueListenable: warehouseId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Warehouse'),
                    isExpanded: true,
                    items: warehouses
                        .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                        .toList(),
                    onChanged: (value) => warehouseId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                LineItemsEditor(
                  products: products,
                  withPrice: false,
                  withDiscount: false,
                  onChanged: (value) => items = value,
                ),
              ],
            ),
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
    if (created != true || context.mounted != true || orderId.value == null) return;
    final cleaned = items.where((i) => (i['description'] as String? ?? '').isNotEmpty).toList();
    if (cleaned.isEmpty) {
      showAppError(context, 'Add at least one item');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(salesRepositoryProvider).createDelivery(
              salesOrderId: orderId.value!,
              warehouseId: warehouseId.value,
              items: cleaned,
            );
        await _refresh();
      },
      success: 'Delivery created',
    );
  }

  Future<void> _deliveryAction(String id, String action, String success) => runAction(
        context,
        () async {
          await ref.read(salesRepositoryProvider).deliveryAction(id, action);
          await _refresh();
        },
        success: success,
      );

  Future<void> _showDetail(Delivery d) async {
    final ctx = context;
    final doc = await ref.read(salesRepositoryProvider).delivery(d.id);
    if (!ctx.mounted) return;
    showModalBottomSheet(
      context: ctx,
      builder: (context) => DocDetailSheet(title: 'Delivery', doc: doc),
    );
  }

  @override
  Widget build(BuildContext context) {
    final deliveries = ref.watch(deliveriesProvider);
    return ListScaffold(
      title: 'Deliveries',
      asyncValue: deliveries,
      itemCount: deliveries.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New delivery',
      builder: (index) {
        final d = deliveries.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.local_shipping),
          title: Text(d.number ?? d.id),
          subtitle: Text((d.orderNumber ?? '').trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(d.status),
              if (d.status == 'DRAFT')
                TextButton(onPressed: () => _deliveryAction(d.id, 'submit', 'Submitted'), child: const Text('Submit')),
              if (d.status == 'SUBMITTED')
                TextButton(onPressed: () => _deliveryAction(d.id, 'post', 'Posted (stock out)'), child: const Text('Post')),
            ],
          ),
          onTap: () => _showDetail(d),
        );
      },
    );
  }
}