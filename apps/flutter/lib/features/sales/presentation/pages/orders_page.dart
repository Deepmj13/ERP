import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/sales/sales_providers.dart';
import '../../../../core/sales/sales_models.dart';
import '../../../../core/widgets/common.dart';
import '../widgets/sales_widgets.dart';

class OrdersPage extends ConsumerStatefulWidget {
  const OrdersPage({super.key});

  @override
  ConsumerState<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends ConsumerState<OrdersPage> {
  Future<void> _refresh() async {
    ref.invalidate(salesOrdersProvider);
  }

  Future<void> _create(BuildContext context) async {
    final customers = await ref.read(customersProvider.future);
    final products = await ref.read(productsProvider.future);
    if (!context.mounted) return;
    final customerId = ValueNotifier<String?>(null);
    final currency = TextEditingController(text: 'USD');
    final notes = TextEditingController();
    var items = <Map<String, dynamic>>[];

    final created = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New sales order'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: customerId,
                  builder: (context, selected, _) => DropdownButtonFormField<String>(
                    initialValue: selected,
                    hint: const Text('Customer'),
                    isExpanded: true,
                    items: customers
                        .map((c) => DropdownMenuItem(value: c.id, child: Text(c.name)))
                        .toList(),
                    onChanged: (value) => customerId.value = value,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(controller: currency, decoration: const InputDecoration(labelText: 'Currency')),
                const SizedBox(height: 12),
                TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes')),
                const SizedBox(height: 12),
                LineItemsEditor(
                  products: products,
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
    if (created != true || context.mounted != true || customerId.value == null) return;
    final cleaned = items.where((i) => (i['description'] as String? ?? '').isNotEmpty).toList();
    if (cleaned.isEmpty) {
      showAppError(context, 'Add at least one item');
      return;
    }
    await runAction(
      context,
      () async {
        await ref.read(salesRepositoryProvider).createSalesOrder(
              customerId: customerId.value!,
              currency: currency.text.trim().isEmpty ? null : currency.text.trim(),
              notes: notes.text.trim().isEmpty ? null : notes.text.trim(),
              items: cleaned,
            );
        await _refresh();
      },
      success: 'Order created',
    );
  }

  Future<void> _orderAction(String id, String action, String success) => runAction(
        context,
        () async {
          await ref.read(salesRepositoryProvider).orderAction(id, action);
          await _refresh();
        },
        success: success,
      );

  Future<void> _showDetail(SalesOrder order) async {
    final ctx = context;
    final doc = await ref.read(salesRepositoryProvider).salesOrder(order.id);
    if (!ctx.mounted) return;
    showModalBottomSheet(
      context: ctx,
      builder: (sheetContext) => DocDetailSheet(title: 'Sales Order', doc: doc),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(salesOrdersProvider);
    return ListScaffold(
      title: 'Sales Orders',
      asyncValue: orders,
      itemCount: orders.valueOrNull?.length ?? 0,
      onRefresh: _refresh,
      onCreate: () => _create(context),
      onCreateLabel: 'New order',
      builder: (index) {
        final order = orders.valueOrNull![index];
        return ListTile(
          leading: const Icon(Icons.shopping_cart),
          title: Text(order.number ?? order.id),
          subtitle: Text('${order.customerName ?? ''} — ${order.total.toStringAsFixed(2)}'.trim()),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              StatusChip(order.status),
              if (order.status == 'DRAFT')
                TextButton(onPressed: () => _orderAction(order.id, 'submit', 'Submitted'), child: const Text('Submit')),
              if (order.status == 'SUBMITTED')
                TextButton(onPressed: () => _orderAction(order.id, 'approve', 'Approved'), child: const Text('Approve')),
              if (order.status == 'DRAFT' || order.status == 'SUBMITTED')
                TextButton(onPressed: () => _orderAction(order.id, 'cancel', 'Cancelled'), child: const Text('Cancel')),
            ],
          ),
          onTap: () => _showDetail(order),
        );
      },
    );
  }
}